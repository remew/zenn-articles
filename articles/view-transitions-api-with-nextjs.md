---
title: "View Transitions API × Next.js × TypeScriptの実用的なサンプルを作った"
emoji: "🐈"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["nextjs", "react", "typescript", "tech", "viewtransitionsapi"]
published: true
---
3月7日頃に公開されたChrome 111にて追加されたAPIの1つに、 `View Transitions API` というものがありました。

Webページの画面遷移に「接続型アニメーション[^1]」を簡単に実現できるAPIで、Chrome 111の公開直後にはフロントエンド界隈の一部で盛り上がっていました。

この記事を見てくださっている方はすでに `View Transitions API` の概要については知っていると思いますので、API自体の具体的な説明は省きます。
もし知らない場合は以下に引用したツイートとスレッドを見ていただくと雰囲気が伝わるかと思います。

https://twitter.com/clockmaker/status/1633232835023872002

今回は、Webページ、WebアプリケーションのUXに革命をもたらすと言っても過言ではない `View Transisions API` をNext.js製のWebアプリケーションに組み込むサンプルを作成したため、知見を共有いたします。

## この記事でわかること

- `View Transitions API` の型定義
- Next.jsでページ遷移時にアニメーションを実行する方法
- 単なる要素の移動に留まらないアニメーションを実現するちょっとした工夫

## 成果物

まずは実際の成果物を共有いたします。

https://view-transitions-api-example.vercel.app/
https://github.com/remew/view-transitions-api-example

フォトギャラリーアプリケーションをイメージしており[^2]、以下の3つの画面が存在します。
1. アルバム一覧画面（トップページ）
    - アルバムのサムネイルとタイトルをグリッド表示する画面
1. アルバム内画像一覧画面
    - アルバムに含まれる画像とタイトルをグリッド表示する画面
1. 画像詳細画面
    - 拡大サイズの画像とタイトル、詳細説明などを表示する画面

`View Transitions API` がサポートされていない環境の方向けに、動作中の画面を収録したgifを以下に掲載します。

![](https://storage.googleapis.com/zenn-user-upload/de08458b578f-20230414.gif)
*全体的な流れ*

## 実装の流れ

### 型定義

筆者はTypeScriptの型安全性によって守られることが大好きなため、今回のサンプルを作成する上でも型による恩恵を受けたいと思いました。
しかし、実装時点でTypeScript公式の型定義は存在しないため、まず始めに型定義を自作することにしました。

以下、[実際のコード](https://github.com/remew/view-transitions-api-example/blob/914c5deb154d558f3749e474beddb782c5467280/src/@types/view-transitions-api/index.d.ts)からの抜粋です。

```tsx
type UpdateCallback = () => Promise<any> | void

declare global {
  export interface ViewTransition {
    readonly updateCallbackDone: Promise<undefined>
    readonly ready: Promise<undefined>
    readonly finished: Promise<undefined>
    skipTransition(): void
  }

  interface Document {
    startViewTransition?: (updateCallback?: UpdateCallback) => ViewTransition
  }
}
```

基本的には[仕様書のAPIセクション](https://w3c.github.io/csswg-drafts/css-view-transitions-1/#api)の定義を参照し、TypeScript向けに調整しています。
TypeScriptでは `interface` の拡張が可能であるため、 `Document` インターフェイスを拡張することで `startViewTransition` メソッドの定義を行っています。

さて、これで `View Transitions API` のメソッドや返り値を型安全に扱うことができました。
次は実際にNext.jsのページ遷移に `View Transitions API` を組み込んでいきます。

### ページ遷移時に `View Transitions API` を実行

`View Transitions API` を用いて遷移アニメーションを実現するためには、 `document.startViewTransition(callback)` （以下、 `startViewTransition` ）に渡した `callback` 内で同期的にDOM操作が行われるか、 `callback` がPromiseを返す場合はそのPromiseが解決されるまでの間にDOM操作が行われる必要があります。

Next.jsでのページ遷移時に `startViewTransition` を呼び出すための方法としてまず始めに思いつくのが `useRouter` で受け取った `push` 関数でページ遷移を行うという方法です。

```tsx
const { push } = useRouter()
const navigateTo = useCallback((url: string) => {
  if (!document.startViewTransition) {
    push(url)
    return
  }
  document.startViewTransition(async () => {
    await push(url)
  })
}, [push])
```

このような定義を行った上で `navigateTo('/some_page')` とすれば、 `View Transitions API` に対応した環境であれば遷移アニメーションを実現することができそうです。
しかしこの方法では、通常のNext.jsの `Link` コンポーネントを用いたページ遷移とは異なった方法での遷移になってしまうため、単純に `Link` コンポーネントを使うことができない問題や、画面によって実装漏れが発生する恐れがあります。

そこで今回は、 `_app.tsx` 内でルーティングに関するイベントハンドリングを行い、イベントハンドラー内で `startViewTransition` を呼び出す方法を採用しました。

以下は[実際のコード](https://github.com/remew/view-transitions-api-example/blob/914c5deb154d558f3749e474beddb782c5467280/src/pages/_app.tsx#L18-L38)にコメントを追加したものになります。

```tsx
useEffect(() => {
  // ページ遷移開始時のコールバック関数
  const onRouteChangeStart = () => {
    // Deferredクラスのインスタンスを生成し、refに保持する 詳しくは後述
    const d = new Deferred()
    deferredRef.current = d
    if (document.startViewTransition) {
      // startViewTransitionのコールバックでは、
      // deferredが保持するPromiseが解決されるのを待つ
      const viewTransition = document.startViewTransition(async () => {
        await d.promise
      })

      // context経由でViewTransitionインスタンスを受け取れるようにするために、
      // Appコンポーネントのstateとして保持している（理由は後述）
      setViewTransition(viewTransition)
    }
  }
  // ページ遷移完了時のコールバック関数
  const onRouteChangeComplete = () => {
    // onRouteChangeStart内で生成されたdeferredをresolveするだけ
    deferredRef.current?.resolve()
  }

  // イベントハンドラーの指定
  events.on('routeChangeStart', onRouteChangeStart)
  events.on('routeChangeComplete', onRouteChangeComplete)
  
  // ちゃんとクリーンアップ関数も返そう！
  return () => {
    events.off('routeChangeStart', onRouteChangeStart)
    events.off('routeChangeComplete', onRouteChangeComplete)
  }
}, [])
```

`routeChangeStart` と `routeChangeComplete` の2つのイベントハンドラーに対してコールバックを設定しているのがポイントです。

`routeChangeStart` はURLの変更処理を開始するタイミングで呼び出され、遷移後のページの `getServerSideProps` などが実行されたのちに `routeChangeComplete` が呼び出されるという流れになっています。
そこで、2つのコールバックにまたがってPromiseの完了状態を制御するために `Deferred` というクラスを定義しています。
`Deferred` とは、簡単に言うと外部からresolve/reject可能なPromiseのようなものです[^3]。

1. `routeChangeStart` で `Deferred` インスタンス `d` を作成
2. そのまま `document.startViewTransition` を呼び出し、コールバックでは `d.promise` の解決を待つ
3. `routeChangeComplete` 内で `d.resolve()` する

という流れによって、Next.jsのページ遷移時における `startViewTransition` の実行を実現しています。
また、 `startViewTransition` の返り値を `App` コンポーネントのローカルステートとして保持しているのですが、これに関しては次の章で理由を説明します。

これによって、ページ遷移時に遷移アニメーションを実行できるようになりました。

### 解像度の違う画像をいい感じに遷移する

実装の説明の最終章です。

さて、今回作成したアプリはフォトギャラリーアプリケーションであるため、

- 一覧表示では小さめの画像
- 詳細画面では大きめの画像

を表示する必要があります。

画像詳細画面に遷移する際、単純に解像度の低い画像を引き伸ばすアニメーションを入れただけだと、（回線速度にもよりますが）高解像度の画像が読み込まれるまで透明の領域が表示されてしまいます。
今回実装したアプリケーションではどのように解決しているのか、「画像一覧から詳細へ遷移するアニメーション」を詳しく見てみましょう。

![](https://storage.googleapis.com/zenn-user-upload/2a872c96cc73-20230414.gif)
*アルバム内画像一覧画面と画像詳細画面の遷移アニメーション*

画像の拡大後は一時的に単色表示にしつつ、少し待つと高解像度な画像が表示されるという動きになっています。

`View Transitions API` によるアニメーションではアニメーション前後のDOMを対応付ける必要がありますが、今回のアニメーションでは単純に「低解像度の画像と高解像度の画像」を紐付けるのではなく、「低解像度の画像と単色のオーバーレイ用要素」を対応付けることで「一時的に単色表示にする」という挙動を実現しています。

また、詳細画面では

- `View Transitions API` によるアニメーションの完了
- 高解像度画像の読み込み完了

の2つが完了した際にオーバーレイ用の要素に `opacity: 0` なCSSクラスが当たるようになっており、これによって「画像の読み込みが完了したら高解像度画像を表示する」という挙動を実現しています。

`View Transitions API` によるアニメーションの完了については、Promiseである `viewTransition.finished` の解決によって判定しており、これを行うために `_app.tsx` で `ViewTransition` インスタンスを保持したりcontext経由で子孫に渡したりしていたのでした。

さらに、DOMの対応付けを行うための `view-transition-name` プロパティを指定するためのCSSクラス（`.transitionTarget`）を付与する要素を条件によって「オーバーレイ用の要素」と「高解像度の画像」で切り替えることで、詳細画面から一覧画面へ戻る際には「高解像度の画像と低解像度の画像」が紐づくようにするといった工夫も入れています。

[PhotoDetailコンポーネント](https://github.com/remew/view-transitions-api-example/blob/914c5deb154d558f3749e474beddb782c5467280/src/features/album/components/PhotoDetail.tsx)で細かい工夫や実装の詳細を見ることができますので、よければ見ていってください。

## 課題点

以上でアプリケーションの実装の流れや実装上の工夫に関する説明を終わりますが、次に課題点について説明いたします。

今回の実装ではNext.jsのルーティングイベントをフックすることで `View Transitions API` を実行しています。
そのため、遷移アニメーションが不要なページ遷移でもフェードイン・フェードアウトがかかってしまうという課題を抱えています。
画面遷移時に何かしらのフラグを渡せたら良さそうなのですが、良い方法が浮かびませんでした。
これが今回の実装における最大の課題点だと思っています。

ただし、今回の実装で達成したかったのは

1. `View Transitions API` を型安全性に配慮した上で扱う
1. Next.jsの `Link` コンポーネントによるページ遷移で透過的に `View Transitions API` を扱う
1. 解像度の違う画像に対しての比較的自然な接続型アニメーション

の3点である上に、デフォルトの遷移アニメーションでも大きな違和感は無いと思われるため、そういう意味では十分目標を達成してはいます。
ただ、もっと柔軟に `View Transitions API` の有効・無効を切り替えることができればより理想的な実装だったと感じています。

## 実装した感想

「こんなAPIが欲しかった…！」の一言に付きます。

数年前にQiitaで https://qiita.com/satsukies/items/a36cb5385282b7fedd3f このような記事を見かけた際に、「あぁ、WebでこういうUIが実装できたらどれだけ素晴らしいだろう！」と思って色々実装してみたのですが、応用の効く形で実装することができず歯痒い思いをしていました。
そんな中で知ったこのAPIには一瞬で魅了され、すぐにサンプルや仕様書を見に行き、今回のアプリケーションを実装しました（その割に記事の公開までにかなり時間がかかってしまいましたが…）。

残念ながら前述のQiita記事のようなアニメーションを完全に再現することはできませんでしたが、自然な視線誘導ができる遷移アニメーションを実装できたのではないかと思います。

個人的には、アニメーション開始時と終了時の位置に関する情報がCSS Variables的な感じで取得できたらいいのになーと思ったりもしました。

Nuxtにはすでに（experimentalではあるものの）対応が取り込まれたことですし、本記事のような方法を用いずともNext.jsやReact DOMが内部的に `View Transitions API` を呼び出してくれるようなAPIが追加されるといいなぁと思っています。

さて、冒頭にも掲載しましたが、最後に改めて成果物とソースコードへのリンクを掲載します。
本記事が皆様の参考になれば幸いです。

https://view-transitions-api-example.vercel.app/
https://github.com/remew/view-transitions-api-example

## 参考リンク

@[card](https://twitter.com/clockmaker/status/1633232835023872002)
https://zenn.dev/yhatt/articles/cfa6c78fabc8fa
https://w3c.github.io/csswg-drafts/css-view-transitions-1/
https://dev.classmethod.jp/articles/typings-of-window-object/

[^1]: 画面遷移の前後で一部の要素が連続的にアニメーションすることを指しています<br/>あまり一般的な用語ではありませんが、[Microsoftのドキュメント](https://learn.microsoft.com/ja-jp/windows/apps/design/motion/connected-animation) などに例があるため見ていただけるとイメージしやすいかと思います
[^2]: ※画像は実際に撮影したものではなく、Stable Diffusion web UI上で生成してUpscaylでアップスケーリングやしたものを使用しています
[^3]: 詳細は https://azu.github.io/promises-book/#deferred-and-promise などを参照ください
