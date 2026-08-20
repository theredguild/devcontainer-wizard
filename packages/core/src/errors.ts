/** Deterministic process exit codes (documented contract for scripts/agents). */
export enum ExitCode {
  Success = 0,
  GenericError = 1,
  UsageError = 2,
  NoEngine = 3,
  EngineUnsupported = 4,
  EngineUnavailable = 5,
  Cancelled = 6,
  StrictHardening = 7,
  NotFound = 8,
  ValidationError = 9,
}

/** Base error carrying a deterministic exit code and a stable machine `code`. */
export class DcwError extends Error {
  readonly exitCode: number
  readonly code: string

  constructor(message: string, exitCode: number = ExitCode.GenericError, code = 'E_GENERIC') {
    super(message)
    this.name = 'DcwError'
    this.exitCode = exitCode
    this.code = code
  }
}

export class NoEngineError extends DcwError {
  constructor(message: string) {
    super(message, ExitCode.NoEngine, 'E_NO_ENGINE')
    this.name = 'NoEngineError'
  }
}

export class EngineUnsupportedError extends DcwError {
  constructor(message: string) {
    super(message, ExitCode.EngineUnsupported, 'E_ENGINE_UNSUPPORTED')
    this.name = 'EngineUnsupportedError'
  }
}

export class EngineUnavailableError extends DcwError {
  constructor(message: string) {
    super(message, ExitCode.EngineUnavailable, 'E_ENGINE_UNAVAILABLE')
    this.name = 'EngineUnavailableError'
  }
}

export class StrictHardeningError extends DcwError {
  constructor(message: string) {
    super(message, ExitCode.StrictHardening, 'E_STRICT_HARDENING')
    this.name = 'StrictHardeningError'
  }
}

export class NotFoundError extends DcwError {
  constructor(message: string) {
    super(message, ExitCode.NotFound, 'E_NOT_FOUND')
    this.name = 'NotFoundError'
  }
}

export class ValidationError extends DcwError {
  constructor(message: string) {
    super(message, ExitCode.ValidationError, 'E_VALIDATION')
    this.name = 'ValidationError'
  }
}

export class CancelledError extends DcwError {
  constructor(message = 'Cancelled.') {
    super(message, ExitCode.Cancelled, 'E_CANCELLED')
    this.name = 'CancelledError'
  }
}
