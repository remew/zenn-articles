---
title: "Node.js環境でも `renderToReadableStream` が使いたい！"
emoji: "📝"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["react", "typescript", "tech"]
published: true
---

## TL;DR

`react-dom/server` ではなく `react-dom/server.browser` からimport/requireする。
TypeScriptの場合は型定義も流用して作成する。

```typescript:src/index.tsx
// 🙅‍♀
// import { renderToReadableStream } from 'react-dom/server'
// 🙆‍♀
import { renderToReadableStream } from 'react-dom/server.browser'
```

```typescript:types/react-dom-server.d.ts
declare module 'react-dom/server.browser' {
  export * from 'react-dom/server'
}
```

## 検証バージョン

|   ライブラリ   |  バージョン  |
|:---------:|:-------:|
|  Node.js  | 20.10.0 |
|   react   | 18.2.0  |
| react-dom | 18.2.0  |

## `renderToReadableStream` とは

React 18から使用可能になったStreaming SSRを実現するためのサーバー向けAPIです。

従来は `renderToString` を用いてコンポーネントを文字列化することでSSRを行っていましたが、 `renderToString` はStreaming SSRをサポートしていません。
そこでStreaming SSRに対応したサーバーを自分で実装する場合、新たに導入された以下のAPIのどちらかを用いる必要があります。
1. `renderToPipeableStream`
2. `renderToReadableStream`

前者の `renderToPipeableStream` はNode.js独自のStream APIを用いているためNode.js環境でのみ使用可能ですが、後者の `renderToReadableStream` はWeb標準のWeb Streamsを用いており、DenoやCloudflare Workersなどのエッジランタイムではこちらを使うことになります。

参考: https://react.dev/reference/react-dom/server/renderToString#migrating-from-rendertostring-to-a-streaming-method-on-the-server

## `renderToReadableStream` を使ってみる

昨今ではCloudflare Workersなどのエッジランタイムで処理を行うというアーキテクチャが少しずつ流行り始めており、ReactのSSRもエッジで行いたいという需要があると思います。
エッジ環境では当然 `renderToReadableStream` を使うとして、ローカル開発時に `renderToReadableStream` を使うことはできないのでしょうか？

いにしえのNode.jsではWeb Streamsが実装されていなかったためAPIが分かれているのも仕方ないのですが、Node.jsにもv16から[Web Streams API](https://nodejs.org/docs/latest/api/webstreams.html)として（experimentalではあるものの）実装されており、v21にはついにstableとなりました。
そこで早速以下のコードを試してみます（アプリケーション・サーバーとして[Hono](https://hono.dev/)を使用しています）。

```typescript jsx:src/index.tsx
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { renderToReadableStream } from 'react-dom/server'

const app = new Hono()
app.get('/', async c => {
  const stream = await renderToReadableStream(<h1>Hello, Streaming SSR</h1>)

  return new Response(stream, {
    headers: { 'content-type': 'text/html' },
  })
})

serve(app, info => {
  console.log(`Listening on ${info.address}:${info.port}`)
})
```

しかし、こちらのコードをtscでコンパイルして実行すると（tsconfig.jsonの設定によって細かい挙動は変わるものの）上手く動きません。
これはNode.js環境だと `react-dom/server` から `renderToReadableStream` がimportできないことが原因です。

react-dom@18.2.0をインストールして `node_modules/react-dom/server.js` を覗いてみましょう。
```javascript:node_modules/react-dom/server.js
'use strict';

module.exports = require('./server.node');
```

```javascript:node_modules/react-dom/server.node.js
'use strict';

var l, s;
if (process.env.NODE_ENV === 'production') {
  l = require('./cjs/react-dom-server-legacy.node.production.min.js');
  s = require('./cjs/react-dom-server.node.production.min.js');
} else {
  l = require('./cjs/react-dom-server-legacy.node.development.js');
  s = require('./cjs/react-dom-server.node.development.js');
}

exports.version = l.version;
exports.renderToString = l.renderToString;
exports.renderToStaticMarkup = l.renderToStaticMarkup;
exports.renderToNodeStream = l.renderToNodeStream;
exports.renderToStaticNodeStream = l.renderToStaticNodeStream;
exports.renderToPipeableStream = s.renderToPipeableStream;
```

ご覧の通り、 `renderToReadableStream` がexportされていません。
ではドキュメントに記載されている `renderToReadableStream` は嘘なのかというとそうではなく、実は `node_modules/react-dom/server.browser.js` というファイルがあるのですが、こちらでは `renderToReadableStream` がexportされています。

```javascript:node_modules/react-dom/server.browser.js
'use strict';

var l, s;
if (process.env.NODE_ENV === 'production') {
  l = require('./cjs/react-dom-server-legacy.browser.production.min.js');
  s = require('./cjs/react-dom-server.browser.production.min.js');
} else {
  l = require('./cjs/react-dom-server-legacy.browser.development.js');
  s = require('./cjs/react-dom-server.browser.development.js');
}

exports.version = l.version;
exports.renderToString = l.renderToString;
exports.renderToStaticMarkup = l.renderToStaticMarkup;
exports.renderToNodeStream = l.renderToNodeStream;
exports.renderToStaticNodeStream = l.renderToStaticNodeStream;
exports.renderToReadableStream = s.renderToReadableStream;
```

`node_modules/react-dom/package.json` には以下のように `exports` というフィールドがあり、実行環境によって `react-dom/server` をimportしたときに実際に読み込むファイルを切り替えているようです。
（この部分に関しては確証が得られていないため、有識者からのコメントがいただけるとありがたいです）
```json:node_modules/react-dom/package.json
{
  // 略
  "exports": {
    ".": "./index.js",
    "./client": "./client.js",
    "./server": {
      "deno": "./server.browser.js",
      "worker": "./server.browser.js",
      "browser": "./server.browser.js",
      "default": "./server.node.js"
    },
    "./server.browser": "./server.browser.js",
    "./server.node": "./server.node.js",
    "./profiling": "./profiling.js",
    "./test-utils": "./test-utils.js",
    "./package.json": "./package.json"
  },
  // 略
}
```

上記の設定内では `"./server.browser": "./server.browser.js"` という設定もあるため、どうやら `react-dom/server.browser` をimportすることでdenoやworker環境で読み込んでいるものと同じファイルがimportできそうです。

そこで先程のHonoを用いたサンプルコードのimport文を書き換えて実行してみたところ無事動作しました。

```typescript jsx:src/index.tsx
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
// @ts-ignore @types/react-domにreact-dom/server.browserの定義が無いためエラーが発生するのを抑制する
import { renderToReadableStream } from 'react-dom/server.browser'

const app = new Hono()
app.get('/', async c => {
  const stream = await renderToReadableStream(<h1>Hello, Streaming SSR</h1>)

  return new Response(stream, {
    headers: { 'content-type': 'text/html' },
  })
})

serve(app, info => {
  console.log(`Listening on ${info.address}:${info.port}`)
})
```

あとは以下の型定義ファイルを適当なディレクトリに配置し、上記コードの `@ts-ignore` を削除すれば完璧です！

```typescript:types/react-dom-server.d.ts
declare module 'react-dom/server.browser' {
  export * from 'react-dom/server'
}
```

これでローカルとエッジ環境の両方で `renderToReadableStream` を用いることができ、同じコードを用いて開発を行うことが可能になりました。

## あとがき

めちゃくちゃニッチな記事ですが、SSRを自前実装する際にちょっとだけ困ったので公開します。
他にも助かる誰かがいると嬉しいです。

今回の最終的なサンプルコードは以下から確認できます。
https://github.com/remew/zenn-articles/tree/master/samples/import-render-to-readable-stream-from-node
