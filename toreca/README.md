# トレカリサーチ：認証不要の公開検索ツール

公開URL: https://cmedia-creator.github.io/tools/toreca/

## 構成

- Google Sheetsを管理DBとし、公開してよい列だけを `data/catalog.json` に変換。
- GitHub PagesでHTML/CSS/JavaScript/JSONを公開。
- 検索語生成はブラウザ内。閲覧者のGoogle認証・GAS実行は不要。
- 辞書275行（出力対象248、入力解決専用27）。既存の検索語生成ロジックを移植。
- 検索ログ・個人情報・内部メモ・観測件数・テスト用証拠は公開しない。
- 公開してよいキーは `scripts/catalog-schema.mjs` のホワイトリストで管理。辞書は7列、ルールは注意文の `id` / `show` のみ。同期とテストの両方で `validateCatalog()` を通し、ホワイトリスト外のキー・メールアドレス・内部文書参照などを検出したら公開データを書き換えない。
- 初回は通常検索リンク。公式URLが未登録のため、報酬はまだ発生しない。
- 検索・クリックのサーバー計測は未接続。検索条件はページURLにも反映されるため、共有したURLにはその条件が含まれる。

## 更新

初回データはGoogle Drive接続から取得したライブDBのスナップショット。スプレッドシートを編集するだけでは現状の公開データは変わらない。

管理者の端末またはGitHub Actionsで `node toreca/scripts/sync-sheet.mjs` を実行し、生成JSONをmainに反映すると公開データを更新できる。同期処理はGoogle Sheets APIの読み取り専用スコープを使い、DBを変更しない。

### 無人同期に必要な管理者設定（未設定）

1. Google CloudでSheets APIを有効にし、読み取り用サービスアカウントを用意。
2. 管理DBを、そのサービスアカウントのメールに閲覧権限で共有。
3. GitHubのRepository Secretsに `GOOGLE_SERVICE_ACCOUNT_JSON`（認証JSON）と `GOOGLE_SHEET_ID` を登録。キーは公開ファイルや会話に貼らない。
4. `toreca/scripts/sync-sheet.mjs` で更新し、検証後にmainへ反映。GitHub Actionsの自動同期はSecrets登録後に有効化する。

既存GitHub Pagesの公開方式はmainブランチからの自動デプロイ。Actionsの標準 `GITHUB_TOKEN` によるコミットはPagesの自動ビルドを発火しないため、自動同期を有効化する際はデプロイの実行経路も設定・確認すること。

接続済みGoogle Driveから公開JSONを更新する手動同期は、サービスアカウント作成前でも可能。

## アフィリエイト

公式機能で発行した検索結果URLだけを `AFFILIATE_LINKS` に登録。`status=ACTIVE`、`source=mercari_official_link_only`、検索語一致、SHA-256一致、重複なしを確認し、`PILOT02_SETTINGS` の `affiliate_enabled` をTRUEにした場合のみ有効にする。URLは一切加工しない。未登録・無効な条件は通常リンク。利用方法の規約確認を完了してから有効化する。

PR表示・購入による運営者への報酬説明・明示クリックを使用。自動遷移や中間リダイレクトはしない。クリック計測を追加する際は、広告リンクのリファラを隠さず、プライバシー説明も更新する。

公式ガイドライン: https://help.jp.mercari.com/guide/articles/1486/

## 確認

Node.js 22以上で `cd toreca && npm test`。外部パッケージは不要。テストは通常検索、6トークン上限、STEP間重複除去、誤リンク排除、公開データの列制限を確認する。
