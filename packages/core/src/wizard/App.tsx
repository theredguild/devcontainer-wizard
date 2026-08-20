import { Box, Text, useApp, useInput } from 'ink'
import { useState } from 'react'
import {
  AI_AGENTS,
  CORE_LANGUAGES,
  FRAMEWORKS,
  FUZZING_AND_TESTING,
  LANGUAGES,
  SECURITY_TOOLING,
  type CatalogItem,
} from '../domain/catalog.js'
import { HARDENING_OPTIONS } from '../domain/hardening.js'
import { DEFAULT_PROFILE, NO_PROFILE, PROFILES, recipesToHardening } from '../domain/profiles.js'
import { createDriver } from '../engine/registry.js'
import type { EngineStatus } from '../engine/resolver.js'
import type { EngineName } from '../engine/types.js'
import { hardeningToEffects } from '../hardening/effects.js'
import { translate } from '../hardening/translator.js'
import type { EnvSpec } from '../spec/env-spec.js'
import { flagsToSpec, type FlagInput } from '../spec/flags-to-spec.js'
import { Banner } from './components/Banner.js'
import { MultiSelect } from './components/MultiSelect.js'
import { Select } from './components/Select.js'
import { TextInput } from './components/TextInput.js'
import { useStepNav } from './hooks/useStepNav.js'

interface Draft {
  engine: string
  name: string
  coreLanguages: string[]
  languages: string[]
  frameworks: string[]
  fuzzingAndTesting: string[]
  securityTooling: string[]
  aiAgents: string[]
  profile?: string
  hardening: string[]
}

export interface AppProps {
  initial: FlagInput
  engines: EngineStatus[]
  onComplete: (spec: EnvSpec) => void
  onCancel: () => void
}

const STEP_TITLES = [
  'Container engine',
  'Name',
  'Core languages',
  'Smart-contract languages',
  'Frameworks',
  'Fuzzing & testing',
  'Security tooling',
  'AI coding agents',
  'Hardening',
  'Review',
]

function toItems(items: CatalogItem[]) {
  return items.map((i) => ({ label: i.label, value: i.value, hint: i.description }))
}

function draftToFlags(draft: Draft, initial: FlagInput): FlagInput {
  return {
    name: draft.name,
    coreLanguages: draft.coreLanguages,
    languages: draft.languages,
    frameworks: draft.frameworks,
    fuzzingAndTesting: draft.fuzzingAndTesting,
    securityTooling: draft.securityTooling,
    aiAgents: draft.aiAgents,
    profile: draft.profile,
    hardening: draft.hardening,
    engine: draft.engine,
    gitUrl: initial.gitUrl,
    gitBranch: initial.gitBranch,
    fallbackName: initial.fallbackName,
  }
}

export function App({ initial, engines, onComplete, onCancel }: AppProps) {
  const { index, next, back } = useStepNav(STEP_TITLES.length)
  const recommended = engines.find((e) => e.recommended)?.name
  const [draft, setDraft] = useState<Draft>({
    engine: initial.engine ?? 'auto',
    name: initial.name ?? initial.fallbackName ?? '',
    coreLanguages: initial.coreLanguages ?? [],
    languages: initial.languages ?? [],
    frameworks: initial.frameworks ?? [],
    fuzzingAndTesting: initial.fuzzingAndTesting ?? [],
    securityTooling: initial.securityTooling ?? [],
    aiAgents: initial.aiAgents ?? [],
    profile: initial.profile,
    hardening: initial.hardening ?? [],
  })

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }))

  // Ctrl-C cancels (ink's default exit is also wired in run.tsx).
  useInput((input, key) => {
    if (key.ctrl && input === 'c') onCancel()
  })

  function renderStep() {
    switch (index) {
      case 0: {
        const choices = [
          {
            label: 'Auto-detect',
            value: 'auto',
            hint: recommended ? `Recommended: ${recommended}` : 'No engine detected yet',
          },
          ...engines.map((e) => ({
            label: `${e.displayName}${e.recommended ? ' ★' : ''}`,
            value: e.name,
            disabled: !e.platform.supported,
            hint: !e.platform.supported
              ? e.platform.reason
              : e.detect?.available
                ? `available${e.detect.version ? ` — ${e.detect.version}` : ''}${describeDrops(e.name)}`
                : `not detected${describeDrops(e.name)}`,
          })),
        ]
        return <Select choices={choices} initialValue={draft.engine} onSubmit={(v) => { patch({ engine: v }); next() }} onBack={onCancel} />
      }
      case 1:
        return (
          <TextInput
            label="Environment name:"
            initial={draft.name}
            onSubmit={(v) => { patch({ name: v || draft.name }); next() }}
            onBack={back}
          />
        )
      case 2:
        return <MultiSelect items={toItems(CORE_LANGUAGES)} initial={draft.coreLanguages} onSubmit={(v) => { patch({ coreLanguages: v }); next() }} onBack={back} />
      case 3:
        return <MultiSelect items={toItems(LANGUAGES)} initial={draft.languages} onSubmit={(v) => { patch({ languages: v }); next() }} onBack={back} />
      case 4:
        return <MultiSelect items={toItems(FRAMEWORKS)} initial={draft.frameworks} onSubmit={(v) => { patch({ frameworks: v }); next() }} onBack={back} />
      case 5:
        return <MultiSelect items={toItems(FUZZING_AND_TESTING)} initial={draft.fuzzingAndTesting} onSubmit={(v) => { patch({ fuzzingAndTesting: v }); next() }} onBack={back} />
      case 6:
        return <MultiSelect items={toItems(SECURITY_TOOLING)} initial={draft.securityTooling} onSubmit={(v) => { patch({ securityTooling: v }); next() }} onBack={back} />
      case 7:
        return <MultiSelect items={toItems(AI_AGENTS)} initial={draft.aiAgents} onSubmit={(v) => { patch({ aiAgents: v }); next() }} onBack={back} />
      case 8:
        return (
          <HardeningStep
            initialProfile={draft.profile}
            initialKeys={draft.hardening}
            onSubmit={(profile, hardening) => { patch({ profile, hardening }); next() }}
            onBack={back}
          />
        )
      case 9:
        return (
          <ReviewStep
            draft={draft}
            initial={initial}
            recommended={recommended}
            onConfirm={onComplete}
            onBack={back}
          />
        )
      default:
        return null
    }
  }

  return (
    <Box flexDirection="column">
      <Banner step={index} total={STEP_TITLES.length} title={STEP_TITLES[index] ?? ''} />
      {renderStep()}
    </Box>
  )
}

function describeDrops(name: EngineName): string {
  const caps = createDriver(name).capabilities
  const dropped = Object.values(caps).filter((c) => c.support === 'unsupported').length
  return dropped > 0 ? ` · drops ${dropped} hardening option(s)` : ''
}

function HardeningStep({
  initialProfile,
  initialKeys,
  onSubmit,
  onBack,
}: {
  initialProfile?: string
  initialKeys: string[]
  onSubmit: (profile: string | undefined, hardening: string[]) => void
  onBack: () => void
}) {
  const [mode, setMode] = useState<'choose' | 'custom'>('choose')

  if (mode === 'custom') {
    return (
      <MultiSelect
        items={HARDENING_OPTIONS.map((o) => ({ label: o.label, value: o.key, hint: o.description }))}
        initial={initialKeys}
        onSubmit={(keys) => onSubmit(undefined, keys)}
        onBack={onBack}
      />
    )
  }

  // Order matters: Select highlights the first enabled choice when there is no
  // prior value, so leading with "None" made an unhardened environment the default
  // answer in a tool whose purpose is isolation. Profiles lead; opting out is last
  // and explicit.
  const choices = [
    ...PROFILES.map((p) => ({
      label: `${p.label}${p.experimental ? ' (experimental)' : ''}`,
      value: p.key,
      hint: `${p.description} — ${p.caveat}`,
    })),
    { label: 'Custom…', value: '__custom__', hint: 'Pick individual hardening options.' },
    { label: 'None (no extra hardening)', value: NO_PROFILE, hint: 'Run without additional restrictions.' },
  ]

  return (
    <Select
      choices={choices}
      initialValue={initialProfile ?? DEFAULT_PROFILE}
      onSubmit={(v) => {
        if (v === '__custom__') setMode('custom')
        else if (v === NO_PROFILE) onSubmit(NO_PROFILE, [])
        else onSubmit(v, recipesToHardening([v]))
      }}
      onBack={onBack}
    />
  )
}

function ReviewStep({
  draft,
  initial,
  recommended,
  onConfirm,
  onBack,
}: {
  draft: Draft
  initial: FlagInput
  recommended?: EngineName
  onConfirm: (spec: EnvSpec) => void
  onBack: () => void
}) {
  let spec: EnvSpec | null = null
  let error: string | null = null
  try {
    spec = flagsToSpec(draftToFlags(draft, initial))
  } catch (e) {
    error = (e as Error).message
  }

  const engineForCaps: EngineName | undefined =
    draft.engine !== 'auto' ? (draft.engine as EngineName) : recommended
  const translation =
    spec && engineForCaps
      ? translate(hardeningToEffects(spec.hardening as never), createDriver(engineForCaps).capabilities, engineForCaps)
      : null

  useInput((_input, key) => {
    if (key.return && spec) onConfirm(spec)
    else if (key.escape) onBack()
  })

  if (error || !spec) {
    return (
      <Box flexDirection="column">
        <Text color="red">Cannot build spec: {error}</Text>
        <Text color="gray">esc to go back</Text>
      </Box>
    )
  }

  const sel = spec.selections
  const line = (k: string, v?: string[]) => (v && v.length ? `${k}: ${v.join(', ')}` : null)
  const lines = [
    `name: ${spec.name}`,
    `engine: ${spec.engine}${spec.engine === 'auto' && recommended ? ` (→ ${recommended})` : ''}`,
    line('core', sel.coreLanguages),
    line('languages', sel.languages),
    line('frameworks', sel.frameworks),
    line('fuzzing', sel.fuzzingAndTesting),
    line('security', sel.securityTooling),
    line('ai agents', sel.aiAgents),
    spec.hardening.length ? `hardening: ${spec.hardening.join(', ')}` : 'hardening: none',
  ].filter(Boolean) as string[]

  return (
    <Box flexDirection="column">
      {lines.map((l) => (
        <Text key={l}>{l}</Text>
      ))}
      {translation && translation.dropped.length > 0 ? (
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow">
            ⚠ {engineForCaps} cannot honor: {translation.dropped.map((e) => e.kind).join(', ')}
          </Text>
        </Box>
      ) : null}
      <Box marginTop={1}>
        <Text color="green">enter to create · esc to go back</Text>
      </Box>
    </Box>
  )
}
