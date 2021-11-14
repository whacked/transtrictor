{ pkgs ? import <nixpkgs> {} }:
pkgs.mkShell {
  buildInputs = [
    pkgs.go
    pkgs.yarn
  ];

  shellHook = ''
    export PATH=$(yarn bin):$PATH

    _SCHEMASTORE_CACHE=
    query-schemastore() {
        if [ "x$_SCHEMASTORE_CACHE" == "x" ]; then
            _SCHEMASTORE_CACHE=$(curl -s https://schemastore.org/api/json/catalog.json)
        fi
        printf "$_SCHEMASTORE_CACHE"
    }

    alias query-schemastore-schema-org-thing="query-schemastore | jq '.schemas[] | select(.name == \"schema.org - Thing\")'"
  '';
}
