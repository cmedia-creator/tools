# トレカリサーチ：認証不要の公開検索ツール

公開URL: https://cmedia-creator.github.io/tools/toreca/

## 構成

- Google Sheetsを管理DBとし、公開してよい列だけを `data/catalog.json` に変換。
- GitHub PagesでHTML/CSS/JavaScript/JSONを公開。
- 検索語生成はブラウザ内。閲覧者のGoogle認証・GAS実行は不要。
- 辞書275行（出力対象248、入力解決専用27）。既存の検索語生成ロジックを移植。
- 検索ログ・個人情報・内部メモ・観測件数・テスト用証拠は公開しない。
- 公開してよいキーは `scripts/catalog-schema.mjs` のホワイトリストで管理。辞書は7列、ルールは注意文の `id` / `show` のみ。同期とテストの両方で `validateCatalog()` を通し、ホワイトリスト外のキー・メールアドレス・内部文書参照などを検出したら公開データを書き換えない。
- 管理DBに登録した30の検索語だけ公式アフィリエイトURL（PR表示）。その他はすべて通常の検索リンク（下記「アフィリエイト」）。
- 検索・クリックのサーバー計測は未接続。検索条件はページURLにも反映されるため、共有したURLにはその条件が含まれる。

## 更新

スプレッドシートを編集するだけでは公開データは変わらない。管理者がブラウザで書き出し、ローカルで検証してmainへ反映する（GitHub Pagesはmainから自動公開）。

書き出しファイルは内部列を含むため、どちらの方式でもリポジトリ外に保存し、コミットしない。読み取るのは公開カタログに必要な8シート（`GROUP_DB` / `MEMBER_DB` / `RELEASE_DB` / `STORE_DB` / `TYPE_DB` / `SEARCH_RULES` / `AFFILIATE_LINKS` / `PILOT02_SETTINGS`）だけで、DBは変更しない。

**方式A：クリップボード経由**

1. ログイン済みのブラウザで管理DBを開き、`scripts/sheet-export.browser.js` の内容をそのページで実行する。左上に出るテキスト欄をクリックすると、書き出しJSONがクリップボードにコピーされる。
2. クリップボードの内容をリポジトリ外のファイルに保存する。

**方式B：クリップボードを使わない照合（2026-10-12〜の標準）**

クリップボードを他の作業と共有している環境では、こちらを使う。書き出し内容をブラウザの外へ出さず、シートごとの一致だけを確かめる。

1. 前回 import に使った書き出しファイル（リポジトリ外に保管）を基準にして、今回シートに加えた変更（`AFFILIATE_LINKS` の追加行、セルの修正）だけを反映した「期待する書き出しファイル」をローカルで作る。
2. 期待ファイルの8シートそれぞれについて、行列をJSON化した文字列のSHA-256を計算する。
3. 管理DBの編集画面で、`scripts/sheet-export.browser.js` と同じ読み取り処理（HTMLビュー、空行の除外、末尾の空列の切り詰め）を実行し、シートごとのSHA-256が期待値と一致するかを true / false だけで返す。値そのものは出力しない。
4. **8シートすべて true のときだけ**次へ進む。1つでも false なら import しない（シートの入力ミスか、期待ファイルの作り方の誤り。セル単位で比べて原因を直す）。
5. 一致した期待ファイルを次回の基準として保管する。

**共通**

1. `cd toreca && npm run import -- <書き出しファイル>` で `data/catalog.json` を再生成する。ホワイトリスト検証に失敗した場合は書き換えない。変更がなければ「unchanged」と表示される。
2. `npm test` が通ることを確認する。`git diff data/catalog.json` で、差分が意図した行（例：追加したリンク）と `updatedAt` だけであることを確かめる。
3. `data/catalog.json` をコミットしてmainへpushする。公開後、対象の検索語を実際に表示してPR表示とリンク先を確認する。

Google Sheets APIで取得する `npm run sync`（`GOOGLE_SHEET_ID` と `GOOGLE_SERVICE_ACCOUNT_JSON` が必要）も同じ変換・検証を使う。無人の自動同期は現時点では設定しない。

## アフィリエイト

公式機能で発行した検索結果URLだけを `AFFILIATE_LINKS` に登録。`status=ACTIVE`、`source=mercari_official_link_only`、検索語一致、SHA-256一致、重複なしを確認し、`PILOT02_SETTINGS` の `affiliate_enabled` をTRUEにした場合のみ有効にする。URLは一切加工しない。未登録・無効な条件は通常リンク。利用方法の規約確認を完了してから有効化する。

### 1検索語1リンク（PILOT 03）

- 1つの検索語に公式リンクは1件だけ。同じ検索語が2行あると、その検索語は無効（通常リンク）になる。
- URLのパラメータは `afid` と `keyword` の2つだけ。価格・販売状態などの絞り込みが付いたURLは受け付けない（ブラウザと公開処理の両方で検証）。
- `AFFILIATE_LINKS` の `link_variant` / `category` / `eval` / `evaluated_at` / `review_due` / `note` は選定管理用で、公開データには出さない（`catalog-schema.mjs` のホワイトリスト）。
- どの検索語を登録するかは検索エンジンとは別に管理する（候補抽出と評価は運営側の資料で行い、エンジンはリンクの有無で検索語を変えない）。

PR表示・購入による運営者への報酬説明・明示クリックを使用。自動遷移や中間リダイレクトはしない。クリック計測を追加する際は、広告リンクのリファラを隠さず、プライバシー説明も更新する。

公式ガイドライン: https://help.jp.mercari.com/guide/articles/1486/

### 現在の状態（2026-10-12 更新）

| 項目 | 状態 |
| --- | --- |
| 公開データ `data/catalog.json` | `affiliateEnabled:true`、`affiliateLinks` **30件**（すべて `ACTIVE`）。登録済みの検索語だけ「メルカリで探す（PR）」、その他は通常リンク |
| 既存24件（PILOT 02、2026-10-11 登録） | 管理DB `AFFILIATE_LINKS` の2〜25行目。メンバー7人 × 指定なし / DRIP / CHOOM の21件と、`BABYMONSTER DRIP / CHOOM / ラキドロ トレカ`。シリーズをドロップダウンで選んだときは公式表記（DRIP / CHOOM）がSTEP 1の先頭になり、従来の長い表記（1st FULL ALBUM など）が2番目に残る |
| 試験運用6件（PILOT 03 第1群、2026-10-12 登録） | 26〜31行目。`BABYMONSTER パリタ MusicKorea ラキドロ` / `パリタ YG 特典` / `ローラ ktown4u サイン会` / `ルカ MAKESTAR トレカ` / `ローラ ラキドロ トレカ` / `アサ タワレコ トレカ`（いずれも `BABYMONSTER` で始まる）。店舗・特典を選んだときにSTEP 1の先頭に出る検索語。メルカリ上で検索結果を確認してから採用した。効果は未検証で、次回の見直し期限は2027-01-10 |
| 管理DB `PILOT02_SETTINGS` の `affiliate_enabled` | `TRUE` |
| 新規リンクの追加 | 2026-10-12 から停止中（利用状況の観測を優先） |

無効のあいだは、管理DBにACTIVE行があっても同期・取り込みで公開データへは出力しない（`validateCatalog()` も無効時のリンクを拒否する）。

### 有効化の手順

1. 管理DBの `PILOT02_SETTINGS` で `affiliate_enabled` を `TRUE` にする。
2. 「更新」の手順で書き出し → `npm run import -- <file>` → `npm test`。差分が `updatedAt`・`affiliateEnabled:true`・登録済みリンクだけであることを `git diff data/catalog.json` で確認する。
3. commit して main へ push。公開後、登録済みの検索語（例：メンバーにラミだけを選ぶ）で「メルカリで探す（PR）」が出ること、その他は通常リンクであることを確認する。
4. 戻すときは `affiliate_enabled` を `FALSE` にして同じ手順で再公開する（リンクの行は消さなくてよい）。

### 公式リンクを追加するとき

1. 公開中のエンジンが実際に生成する検索語を確かめる（`normalized_query` はこれと完全一致させる）。既存行と重複しないことも確認する。
2. ログイン済みのメルカリで、その検索語の通常の検索画面を開く（価格・状態などの絞り込みはしない）。ツールバーの「リンク生成 → リンクのみ」で発行する。
3. 発行されたURLが `https://jp.mercari.com/search?` ＋ `afid` と `keyword` の2パラメータだけで、`keyword` が検索語と一致することを確かめる。クリップボードを使わない場合は、ページ内で期待URLとの完全一致とSHA-256の一致を true / false で確認する。URLは一切加工しない。
4. `AFFILIATE_LINKS` に1行追加する。`status=ACTIVE`、`source=mercari_official_link_only`、`verified_at` は確認した日時（UTC、例 `2026-10-11T22:36:14Z`）、`url_sha256` はURL文字列（UTF-8）のSHA-256。`pattern_id` は `p3_` ＋ 正規化（NFKC・小文字）した検索語のSHA-256（既存の `p2_` 行と同じ作り方）。管理用の列（`note` / `category` / `eval` / `evaluated_at` / `review_due`）は公開されない。
5. 「更新」の手順で書き出し → import → `npm test` → 公開 → 本番で表示確認。

運営者本人がこれらのリンク経由で購入しない（ガイドラインの禁止事項）。

## 確認

Node.js 22以上で `cd toreca && npm test`。外部パッケージは不要。テストは通常検索、6トークン上限、STEP間重複除去、誤リンク排除、公開データの列制限、アフィリエイト有効・無効の両状態（公式URLの無加工、PR表示、未登録語の通常リンク、検索語が変わらないこと）を確認する。公開データの状態（有効・無効）によらず通る。
