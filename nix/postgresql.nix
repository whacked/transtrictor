{ pkgs ? import <nixpkgs> {} }:
pkgs.mkShell {
  buildInputs = [
    pkgs.postgresql
  ];  # join lists with ++

  nativeBuildInputs = [
    ~/setup/bash/postgresql_shortcuts.sh
  ];

  shellHook = ''
    echo-shortcuts ~/setup/bash/postgresql_shortcuts.sh
    echo-shortcuts ${__curPos.file}
  '';  # join strings with +
}
