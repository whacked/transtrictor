{ pkgs ? import <nixpkgs> {} }:

let
  nixShortcuts = (builtins.fetchurl {
    url = "https://raw.githubusercontent.com/whacked/setup/2d55546118ec3a57bdfda1861458ab8bce8c9c38/bash/nix_shortcuts.sh";
    sha256 = "11h3dipdrd2ym4ar59q3fligdmqhb5zzbbhnymi9vjdsgcs565iw";
  });
in pkgs.mkShell {
  buildInputs = [
    pkgs.gnumake
    pkgs.go
    pkgs.jsonnet
    pkgs.yarn
  ];

  nativeBuildInputs = [
    nixShortcuts
    ~/setup/bash/shell_shortcuts.sh
  ];

  shellHook = ''
    export PATH=$(yarn bin):$PATH

    run-cli-tests() {
      # TODO: consolidate test runners in addition to the "jest" launch command
      _input=src/testdata/example-json-input-good.jsonnet
      _multiline_input=src/testdata/example-json-input-good-multiline.jsonl
      _schema=src/testdata/example-json-schema.jsonnet
      _transformer=src/testdata/sample-transformer.jsonata
      _post_schema=src/testdata/example-post-transform-schema.jsonnet

      ts-node scripts/cli.ts --schema $_schema --input $_input --transformer $_transformer --postTransformSchema $_post_schema
      jsonnet $_input | ts-node scripts/cli.ts --schema $_schema --input - --transformer $_transformer --postTransformSchema $_post_schema
      ts-node scripts/cli.ts --schema $_schema --jsonLines $_multiline_input --transformer $_transformer --postTransformSchema $_post_schema
      cat $_multiline_input | ts-node scripts/cli.ts --schema $_schema --jsonLines - --transformer $_transformer --postTransformSchema $_post_schema
    }

    alias run-tests='jest'
    alias start-front='parcel app/index.html'
    alias start-back='ts-node parsers/multi.ts'
    echo -e "\033[0;34m  generate-schema <some-data.json> to auto-generate a json schema \033[0m"

    echo-shortcuts ${__curPos.file}
  '';
}
