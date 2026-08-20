# devcontainer-wizard

Thin alias package. Installing it installs
[`@theredguild/devcontainer-wizard`](https://www.npmjs.com/package/@theredguild/devcontainer-wizard)
and forwards every invocation to it.

```sh
npm i -g devcontainer-wizard
dcw --help
```

> [!IMPORTANT]
> **v2 is a complete rewrite and is not backwards compatible with v1.** It no longer
> generates a `devcontainer.json`, and shares no commands with the v1 wizard you may
> already have installed under this name. If you still need the old behavior, pin
> `npm i -g devcontainer-wizard@1`. See the
> [repository README](https://github.com/theredguild/devcontainer-wizard) for the full
> v2 command set and an upgrade guide.

It exists so the unscoped name keeps working. If you have no existing
dependency on it, install the scoped package directly:

```sh
npm i -g @theredguild/devcontainer-wizard
```

Both packages provide the same two binaries — `dcw` and `devcontainer-wizard` —
so installing both globally leaves them competing for the same symlinks. Install
one.

Documentation lives in the [repository README](https://github.com/theredguild/devcontainer-wizard).
