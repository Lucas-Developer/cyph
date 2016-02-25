#!/bin/bash

source ~/.bashrc

dir="$(pwd)"
cd $(cd "$(dirname "$0")"; pwd)/..

merge () {
	git pull
	git merge $1
	git commit -a -m merge
	git push
}

branch="$(git branch | awk '/^\*/{print $2}')"

git remote add internal git@github.com:cyph/internal.git
git remote add public git@github.com:cyph/cyph.git
git fetch --all
git checkout internal/prod
merge internal/master
git push public master
git checkout internal/master
merge internal/prod

git checkout origin/$branch

cd "${dir}"