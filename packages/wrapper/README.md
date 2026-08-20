# devcontainer-wizard

Thin alias package. Installing it installs
[`@theredguild/devcontainer-wizard`](https://www.npmjs.com/package/@theredguild/devcontainer-wizard)
and forwards every invocation to it.

```sh
npm i -g devcontainer-wizard
dcw --help
```

It exists so the unscoped name keeps working. If you have no existing
dependency on it, install the scoped package directly:

```sh
npm i -g @theredguild/devcontainer-wizard
```

Both packages provide the same two binaries — `dcw` and `devcontainer-wizard` —
so installing both globally leaves them competing for the same symlinks. Install
one.

Documentation lives in the [repository README](https://github.com/theredguild/devcontainer-wizard).
