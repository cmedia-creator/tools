# トレカリサーチ：認証不要の公開検索ツール

公開URL: https://cmedia-creator.github.io/tools/toreca/

## 構成

- Google Sheetsを管理DBとし、公開してよい列だけを `data/catalog.json` に変換。
- GitHub PagesでHTML/CSS/JavaScript/JSONを公開。
- 検索語生成はブラウザ内。閲覧者のGoogle認証・GAS実行は不要。
- 辞書275行（出力対象248、入力解決専用27）。既存の検索語生成ロジックを移植。
- 検索ログ・個人情報・内部メモ・観測件数・テスト用証拠は公開しない。
- 公開してよいキーは `scripts/catalog-schema.mjs` のホワイトリストで管理。辞書は7列、ルールは注意文の `id` / `show` のみ。同期とテストの両方で `validateCatalog()` を通し、ホワイトリスト外のキー・メールアドレス・内部文書参照などを検出したら公開データを書き換えない。
- 管理DBに登録した24の検索語だけ公式アフィリエイトURL（PR表示）。その他はすべて通常の検索リンク（下記「アフィリエイト」）。
- 検索・クリックのサーバー計測は未接続。検索条件はページURLにも反映されるため、共有したURLにはその条件が含まれる。

## 更新

スプレッドシートを編集するだけでは公開データは変わらない。管理者がブラウザで書き出し、ローカルで検証してmainへ反映する（GitHub Pagesはmainから自動公開）。

1. ログイン済みのブラウザで管理DBを開き、`scripts/sheet-export.browser.js` の内容をそのページで実行する。左上に出るテキスト欄をクリックすると、書き出しJSONがクリップボードにコピーされる。読み取るのは公開カタログに必要な8シートだけで、DBは変更しない。
2. クリップボードの内容をリポジトリ外のファイルに保存する（内部列を含むためコミットしない）。
3. `cd toreca && npm run import -- <保存したファイル>` で `data/catalog.json` を再生成する。ホワイトリスト検証に失敗した場合は書き換えない。変更がなければ「unchanged」と表示される。
4. `npm test` が通ることを確認し、`data/catalog.json` をコミットしてmainへpushする。

Google Sheets APIで取得する `npm run sync`（`GOOGLE_SHEET_ID` と `GOOGLE_SERVICE_ACCOUNT_JSON` が必要）も同じ変換・検証を使う。無人の自動同期は現時点では設定しない。

## アフィリエイト

公式機能で発行した検索結果URLだけを `AFFILIATE_LINKS` に登録。`status=ACTIVE`、`source=mercari_official_link_only`、検索語一致、SHA-256一致、重複なしを確認し、`PILOT02_SETTINGS` の `affiliate_enabled` をTRUEにした場合のみ有効にする。URLは一切加工しない。未登録・無効な条件は通常リンク。利用方法の規約確認を完了してから有効化する。

PR表示・購入による運営者への報酬説明・明示クリックを使用。自動遷移や中間リダイレクトはしない。クリック計測を追加する際は、広告リンクのリファラを隠さず、プライバシー説明も更新する。

公式ガイドライン: https://help.jp.mercari.com/guide/articles/1486/

### 現在の状態（2026-10-11）

| 項目 | 状態 |
| --- | --- |
| 管理DB `AFFILIATE_LINKS` | 24候補すべて `ACTIVE`。公式ツールバーの「リンクのみ」で発行したURLをそのまま登録（メンバー7人 × 指定なし / DRIP / CHOOM の21件と、`BABYMONSTER DRIP / CHOOM / ラキドロ トレカ`）。シリーズをドロップダウンで選んだときは公式表記（DRIP / CHOOM）がSTEP 1の先頭になり、従来の長い表記（1st FULL ALBUM など）が2番目に残る |
| 管理DB `PILOT02_SETTINGS` の `affiliate_enabled` | `TRUE` |
| 公開データ `data/catalog.json` | `affiliateEnabled:true`、`affiliateLinks` 24件。登録済みの検索語だけ「メルカリで探す（PR）」、その他は通常リンク |

無効のあいだは、管理DBにACTIVE行があっても同期・取り込みで公開データへは出力しない（`validateCatalog()` も無効時のリンクを拒否する）。

### 有効化の手順

1. 管理DBの `PILOT02_SETTINGS` で `affiliate_enabled` を `TRUE` にする。
2. 「更新」の手順で書き出し → `npm run import -- <file>` → `npm test`。差分が `updatedAt`・`affiliateEnabled:true`・登録済みリンクだけであることを `git diff data/catalog.json` で確認する。
3. commit して main へ push。公開後、登録済みの検索語（例：メンバーにラミだけを選ぶ）で「メルカリで探す（PR）」が出ること、その他は通常リンクであることを確認する。
4. 戻すときは `affiliate_enabled` を `FALSE` にして同じ手順で再公開する（リンクの行は消さなくてよい）。

公式リンクを追加するときは、ログイン済みのメルカリで対象の検索語を開き、ツールバーの「リンク生成 → リンクのみ」で発行して「コピーする」で取得する。`normalized_query` はツールが実際に生成する検索語と完全一致させ、`url_sha256` はURL文字列（UTF-8）のSHA-256。運営者本人がこれらのリンク経由で購入しない（ガイドラインの禁止事項）。

## 確認

Node.js 22以上で `cd toreca && npm test`。外部パッケージは不要。テストは通常検索、6トークン上限、STEP間重複除去、誤リンク排除、公開データの列制限、アフィリエイト有効・無効の両状態（公式URLの無加工、PR表示、未登録語の通常リンク、検索語が変わらないこと）を確認する。公開データの状態（有効・無効）によらず通る。
