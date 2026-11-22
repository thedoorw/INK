# INK #559 optional Adobe core third-party notices (private candidate)

These notices apply to the private candidate bundle. Exact versions and SHA-512 registry integrity values are pinned in product/source/package-lock.json. The MIT texts below come from the exact npm tarballs except @dprint/json, for which the exact upstream source LICENSE is included because its npm tarball omits that file.

## Runtime package inventory

- ag-psd@34.1.0 — MIT; complete text in LICENSES/ag-psd-MIT.txt.
- base64-js@1.5.1 — MIT; complete text below.
- pako@2.1.0 — MIT AND Zlib; both complete texts in LICENSES/pako-MIT.txt.
- @create-art/source-format@0.2.15, @create-design/ai@0.0.17, @create-design/source@0.4.16, dprint-plugin-fea@0.1.2 — MPL-2.0; complete text in LICENSES/create-design-MPL-2.0.txt.
- @dprint/formatter@0.6.0, @dprint/json@0.25.2, zod@4.6.7 — MIT; complete texts below.

## MPL corresponding-source references and license-map note

Exact source for @create-art/source-format@0.2.15, @create-design/ai@0.0.17, and @create-design/source@0.4.16: https://github.com/jeremybanka/create-font/tree/f725ab2c06b3232239d7f3bff2ed61f870b23326 (package directories are named in each package.json). Exact source for dprint-plugin-fea@0.1.2: https://github.com/jeremybanka/create-font/tree/68318f80a48d777a51fb50bd31b7ffdd4642b6cd/packages/dprint-plugin-fea. That source tree contains the build source for the npm-distributed WASM.

At create-font commit f725ab2c06b3232239d7f3bff2ed61f870b23326, the repository root licensing map does not list packages/create-design/ai/**. However, the exact @create-design/ai@0.0.17 package.json and its package LICENSE both declare MPL-2.0. This candidate includes the package-local MPL text and exact source reference; the discrepancy is recorded for release review and is not a legal approval.

## MIT license texts

### base64-js@1.5.1

The MIT License (MIT)

Copyright (c) 2014 Jameson Little

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

### @dprint/formatter@0.6.0

The MIT License (MIT)

Copyright (c) 2020 David Sherret

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

### zod@4.6.7

MIT License

Copyright (c) 2025 Colin McDonnell

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

### @dprint/json@0.25.2 (MIT)

Exact source commit: https://github.com/dprint/dprint-plugin-json/tree/f643fb7f6a119e7e8e87abbe8da7d9ca69aaebd9.

The MIT License (MIT)

Copyright (c) 2020 David Sherret

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
