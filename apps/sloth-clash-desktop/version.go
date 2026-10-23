package main

// AppVersion is the release tag without the "v": X.Y.Z, plus "-beta.N" on a
// beta build so the beta channel can tell beta.1 from beta.2 (and from the
// final X.Y.Z). wails.json info.productVersion stays plain X.Y.Z (the Windows
// file version has no room for a suffix).
const AppVersion = "0.1.1-beta.1"
