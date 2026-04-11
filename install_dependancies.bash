#! /usr/bin/env bash

python3.12 -m venv venv

source source.bash

pip install --upgrade pip

pip install litert-lm-api-nightly requests black
