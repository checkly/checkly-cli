# Embedded-packages tarball fixtures

Tiny deterministic `.tgz` files used by the embedded-packages bundling tests
in `playwright-check.spec.ts`. Their sha512 integrities are hardcoded in the
`pnpm-lock.yaml` files of the `test-embedded-packages*` fixtures, so the
tarball bytes and the lockfile entries must change together.

`ms@2.1.3.tgz` is different: it is the genuine registry artifact for
`ms@2.1.3` (from https://registry.npmjs.org/ms/-/ms-2.1.3.tgz), used by the
`test-bundling-workspace-lockfile-prune-embed` fixture, whose lockfile must
survive a real offline `pnpm install --lockfile-only` regeneration — a fake
package would 404 when pnpm re-resolves a stale lockfile, so the kept-side
embedded package has to be real. Its integrity in that fixture's lockfile is
the real registry integrity.

To regenerate (and then update the `resolution.integrity` values the script
prints into the fixture lockfiles):

```python
import tarfile, gzip, io, json, hashlib, base64

def make_tgz(dest, name, version):
    tar_buf = io.BytesIO()
    with tarfile.open(fileobj=tar_buf, mode='w', format=tarfile.GNU_FORMAT) as tf:
        pkg = json.dumps({"name": name, "version": version, "main": "index.js"}, indent=2).encode()
        idx = f'module.exports = {json.dumps(name + "@" + version)}\n'.encode()
        for path, data in [("package/package.json", pkg), ("package/index.js", idx)]:
            info = tarfile.TarInfo(path)
            info.size = len(data)
            info.mtime = 0
            info.mode = 0o644
            tf.addfile(info, io.BytesIO(data))
    gz_buf = io.BytesIO()
    with gzip.GzipFile(fileobj=gz_buf, mode='wb', mtime=0) as gz:
        gz.write(tar_buf.getvalue())
    content = gz_buf.getvalue()
    open(dest, 'wb').write(content)
    print(dest, 'sha512-' + base64.b64encode(hashlib.sha512(content).digest()).decode())

make_tgz("@acme+private-utils@1.2.3.tgz", "@acme/private-utils", "1.2.3")
make_tgz("legacy-private-pkg@2.1.0.tgz", "legacy-private-pkg", "2.1.0")
```
