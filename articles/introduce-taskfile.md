---
title: "Taskfileを使ってみよう"
emoji: "✅"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["taskfile", "gotask", "自動化"]
published: false
---

株式会社FLINTERSで業務委託としてお世話になっています、フロントエンドエンジニアのれみゅーです。

この記事は FLINTERSブログ祭り🏮 の記事です。テーマは「技術」でお送りします。

FLINTERSブログ祭り🏮 については[こちら](https://www.wantedly.com/companies/flinters/post_articles/904545)

## はじめに

今回は、最近業務で使用して便利だと感じた `Taskfile` というツールの紹介と、どのような活用方法があるかを書きます。

## 対象読者

- `Taskfile` の便利な使い方を知りたい人
- (おまけ) `Makefile` との比較をしたい人

## `Taskfile` とは

Go言語で実装されたタスクランナーです。

設定ファイルをyamlで記述でき、タスク間の依存関係の定義なども簡単に行えます。

## インストール方法

macOS ユーザーで `brew` が導入済みなら

```shell
brew install go-task
```

が一番楽です。

あるいはGo言語の環境が構築済みであれば、

```shell
go install github.com/go-task/task/v3/cmd/task@latest
```

でインストールすることもできます。

他にも色々なインストール方法があるので、[公式のinstallation](https://taskfile.dev/installation/)を見てみると良いでしょう。

## 使い方

`Taskfile` を使用するためには、まず `Taskfile.yml` を作成する必要があります。

```yaml:Taskfile.yml
version: '3'

tasks:
  hello:
    cmds:
      - echo 'Hello World from Task!'
    silent: true
```

作成後、同じディレクトリで `task hello` を実行すると `Hello World from Task!` と表示されます。

`Taskfile` では、 `tasks` 以下のキーがタスク名になり、さらにその下の `cmds` にコマンドを書いていきます。
そのため、今回の例では `hello` がタスク名となり、 `task hello` で `echo` コマンドが実行されました。

さらに `Taskfile` は通常、以下のように実行するコマンド自体も表示してくれます。
```shell
echo 'Hello World from Task!'
Hello World from Task!
```
しかし、 `silent: true` をつけることでコマンドの出力のみを見ることができます。
実行されるコマンドとコマンドの出力が混じって見づらいという問題を回避することができるため、私は基本的に `silent: true` を有効化しています。

次はもう少し実用的な例を見ていきましょう。

```yaml:Taskfile.yml
version: '3'
  
silent: true

tasks:
  default:
    aliases:
      - list
    desc: List all tasks
    cmd: task -l

  dev:
    desc: Start dev server
    deps:
      - task: dev:backend
      - task: dev:frontend

  dev:backend:
    desc: Start backend server
    dir: ./backend
    cmd: docker compose up

  dev:frontend:
    desc: Start frontend dev server
    dir: ./frontend
    deps:
      - frontend:install-deps
    cmd: pnpm run dev

  frontend:install-deps:
    desc: Install dependencies
    dir: ./frontend
    cmd: pnpm install --frozen-lockfile
```

雰囲気でも何をやっているのかわかると思いますが、タスク定義を一つ一つ見ていきましょう。

### `default`

`default` というタスク名を使ってタスクを定義することで、タスク名を指定しなかった場合に実行されるタスクを定義することができます。
また、 `aliases` でタスクのエイリアスを設定することができ、今回は `list` というタスク名をエイリアスとして設定しています。

最初のサンプルでは `cmds` で実行するコマンドを定義していましたが、コマンドが1つだけの場合 `cmd` で定義することもできます。

`cmd` に記載している `task -l` というコマンドは、定義されているタスクのうち説明(`desc`)が記入されているものを一覧表示するというコマンドです。
そのため、 `task`/`task default`/`task list` のいずれかを実行することで、以下の出力が得られます。

```shell
task: Available tasks for this project:
* default:                     List all tasks      (aliases: list)
* dev:                         Start dev server
* dev:backend:                 Start backend server
* dev:frontend:                Start frontend dev server
* frontend:install-deps:       Install dependencies
```

### `dev`

`dev` というタスクでは、このあと定義する `dev:backend`/`dev:frontend` という2つのタスクを並列実行しています。

`deps` に複数のタスクを指定することで、それらを並列に実行することができます。
つまり、今回の例ではバックエンドサーバーとフロントエンド環境の両方を1つのコマンドで同時に起動することができるということです。

また、今回は指定していませんが、 `cmd`/`cmds` を指定していた場合は `deps` がすべて終了したあとにコマンドを実行することができます(`dev:frontend` で紹介しています)。

### `dev:backend`

`Taskfile.yml` と同じディレクトリにある `backend` ディレクトリの中で `docker compose up` を実行します。

このように、`Taskfile` では実行ディレクトリを簡単に切り替えることができます。

### `dev:frontend` / `frontend:install-deps`

`dev:frontend` では `pnpm run dev` を実行しますが、実行前に `frontend:install-deps` というタスクを実行します。

通常フロントエンド系のプロジェクトでは、 `pnpm install` を実行した後に `pnpm run dev` などを実行してフロント側のサーバーや `vite` などを起動する必要があります。
しかしこのように設定を書くことで、開発サーバーの起動前に自動的に依存ライブラリのインストールを行うことができます。

### git submodule の初期化

上記のサンプルには記載していませんが、最近関わっているプロジェクトで非常に便利な使い方を発見したので、併せて紹介します。

`git submodule` は何かと面倒が多いと思います。
たとえば、通常のリポジトリと違い submodule を持つリポジトリはclone時に `--recursive` をつけるか、clone後に `git submodule update --init` を実行する必要があります。
しかし `Taskfile` を用いることで、このような手間を減らすことができます。

以下のような `Taskfile.yml` を作成します(一部省略)。

```yaml:Taskfile.yml
tasks:
  init-submodule:
    desc: Initialize submodule
    status:
      # `vendors/some-module` ディレクトリが空の場合にサブモジュールの初期化を実行
      - test -n "$(ls vendors/some-module)"
    cmd: git submodule update --init vendors/some-module
```

`status` というキーがタスク定義の中にありますね。
これは、 `status` 以下に列挙されたコマンドの終了ステータスが `0` でない場合に `cmd`/`cmds` を実行するという意味になります ( `0` の場合にスキップすると考えても良い)。

`test -n "$(ls vendors/some-module)"` を実行することで、 `vendors/some-module` ディレクトリが空かどうかを判定することができます。
そのため、上記のタスク定義で「サブモジュールが初期化されていない場合に初期化を実行する」というタスクが定義できます。

これを使うことで、例えば開発サーバーの実行にサブモジュールが必要な場合のタスクも以下のように書くことができます。

```yaml:Taskfile.yml
tasks:
  dev:
    desc: Start dev server
    # 必要な場合はサブモジュールの初期化を行う
    deps:
      - task: init-submodule
    # サブモジュールの初期化後に開発サーバーを起動する
    cmds:
      - task: dev:server

  dev:server:
    deps:
      - task: dev:backend
      - task: dev:frontend
```

タスクの実行条件をシンプルに書けるのも `Taskfile` の良い点ですね。

## `Taskfile.yml` の分割

さて、 `Taskfile.yml` の書き方を色々と紹介しましたが、プロジェクトの規模が大きくなるにつれ、 `Taskfile.yml` が肥大化することが容易に想像できます。
そんなときのために、 `Taskfile` はタスク定義ファイルの分割にも対応しています。

上記のサンプルを `Taskfile.yml` `taskfiles/Taskfile.backend.yml` `taskfiles/Taskfile.frontend.yml` に分割してみましょう。

```yaml:Taskfile.yml
version: '3'

silent: true

includes:
  backend:
    taskfile: taskfiles/Taskfile.backend.yml
    # dir を指定しない場合、該当 Taskfile 内で指定する dir の起点がこのファイルと同じディレクトリになってしまう
    dir: taskfiles

  frontend:
    taskfile: taskfiles/Taskfile.frontend.yml
    # 同上
    dir: taskfiles

tasks:
  default:
    aliases:
      - list
    desc: List all tasks
    cmd: task -l

  dev:
    desc: Start dev server
    # 必要な場合はサブモジュールの初期化を行う
    deps:
      - task: init-submodule
    # サブモジュールの初期化後に開発サーバーを起動する
    cmds:
      - task: dev:server

  init-submodule:
    desc: Initialize submodule
    status:
      # `vendors/some-module` ディレクトリが空の場合にサブモジュールの初期化を実行
      - test -n "$(ls vendors/some-module)"
    cmd: git submodule update --init vendors/some-module

  dev:server:
    deps:
      - task: backend:dev
      - task: frontend:dev
```

```yaml:Taskfile.backend.yml
version: '3'

silent: true

tasks:
  dev:
    desc: Start backend server
    dir: ../backend
    cmd: docker compose up
```

```yaml:Taskfile.frontend.yml
version: '3'

silent: true

tasks:
  dev:
    desc: Start frontend dev server
    dir: ../frontend
    deps:
      - install-deps
    cmd: pnpm run dev

  install-deps:
    desc: Install dependencies
    dir: ../frontend
    cmd: pnpm install --frozen-lockfile
```

メインの `Taskfile.yml` で `includes` という設定を追加しました。
`includes` 直下のキーは、読み込むタスクの名前空間のようなものになり、 `(キー):(読み込み先のタスク名)` という名前でタスクが定義されたのと同じような扱いになります。
そのため、例えば `Taskfile.frontend.yml` 内で定義されている `install-deps` は `frontend:install-deps` というタスクで実行できます。

参考までに上記の `Taskfile.yml` たちを用意した上で `task list` を実行してみると以下のような結果が得られます。

```shell
task: Available tasks for this project:
* default:                     List all tasks      (aliases: list)
* dev:                         Start dev server
* init-submodule:              Initialize submodule
* backend:dev:                 Start backend server
* frontend:dev:                Start frontend dev server
* frontend:install-deps:       Install dependencies
```

## `GNU make` との比較

さて、「プロジェクトでよく使うタスクを書いておく」という目的で `GNU make` を使用する方も多いと思います。
`GNU make` も似たようなことができるため、筆者も `Taskfile` を知るまでは `Makefile` に色々書いて `make dev` で開発サーバーを立ち上げられるようにしたりしていました。
そこで、筆者が感じた `Taskfile` の優位性を書いていこうと思います。

### マニュアルが読みやすい

[GNU makeのドキュメント](https://www.gnu.org/software/make/manual/make.html)に比べて、[Taskfileのドキュメント](https://taskfile.dev/)の方が読みやすく感じました。

「それってあなたの感想ですよね？」と言われたらそれまでですが、長大な1ページのHTMLより複数ページに分かれている方がページを開いたときの「こんなに長いのか…」感が少なくて読みやすい気がしました。
あとサイト内検索もあるのがポイント高いです。

### タスク管理に特化したファイル構造

`GNU make` はどちらかというと「成果物」と「成果物が依存するファイル」にフォーカスしたシンタックスを持っています。
`.PHONY` というキーワードでタスク管理のようなこともできますが、タスク管理用に `GNU make` を使おうと思うと、ほとんどすべてのターゲットに `.PHONY` をつける必要が出てきてしまいます。

一方 `Taskfile` はその名の通りタスク管理に特化しており、以下のようなタスク管理に必要な情報をyamlベースで記述できる点がわかりやすいと感じました。

- タスク名
- タスクの説明
- タスクの依存関係
- タスクの実行条件
- タスク定義の分割

特に、別ファイルに分割したタスク定義を読み込む際に名前空間をつける必要があるところが特徴的で気に入りました。

## リンク

- [Taskfileのドキュメント](https://taskfile.dev/)

## まとめ

本記事では、タスクランナーである `Taskfile` の紹介をしました。
簡易的かつある程度実用性のありそうなサンプルの紹介を通して、少しでも `Taskfile` の便利さが伝わると嬉しいです。
この記事を読んで気になった方はぜひ使ってみてください！
