{ pkgs ? import <nixpkgs> {} }:
pkgs.mkShell {
  buildInputs = [
    pkgs.gnumake
    pkgs.go
    pkgs.jsonnet
    pkgs.yarn
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
    alias run-webserver='parcel app/index.html'
  '';
}
