export const en = {
  'app.title': 'Familiar',
  'app.stubBanner':
    'STUB AUTH, DEV ONLY. Identity is just two headers you type in. This is not login and not secure. No capture, no media.',
  'nav.label': 'Main',
  'nav.home': 'Home',
  'nav.settings': 'Dev settings',
  'nav.review': 'Review',
  'nav.consent': 'Consent & enrollment',
  'nav.convert': 'New conversion',
  'lang.label': 'Language',
  'home.heading': 'Welcome',
  'home.body':
    'Reference client for the Familiar review API. Only guardians with explicit consent can have a parent voice and face applied to family content. The server enforces every consent rule; this app only shows what the server allows.',
  'home.needSettings': 'Set a family id and guardian id in Dev settings first.',
  'settings.heading': 'Dev settings (stub auth)',
  'settings.warning':
    'These values are sent as x-family-id and x-guardian-id headers. They are not credentials. Never enter secrets here.',
  'settings.baseUrl': 'API base URL',
  'settings.familyId': 'Family id',
  'settings.guardianId': 'Guardian id',
  'settings.save': 'Save',
  'settings.saved': 'Saved.',
  'settings.check': 'Check API health',
  'settings.healthOk': 'API reachable.',
  'settings.healthFail': 'API not reachable.',
  'error.generic': 'Something went wrong ({code}).',
  'error.missing_auth_headers': 'Set a family id and guardian id in Dev settings.',
  'error.wrong_family': 'That belongs to a different family. Request refused.',
  'error.network_error': 'Cannot reach the API.',
} as const;

export type MessageKey = keyof typeof en;

export const ja: Record<MessageKey, string> = {
  'app.title': 'Familiar',
  'app.stubBanner':
    'スタブ認証・開発専用です。本人確認は入力した2つのヘッダーだけで、ログインでも安全でもありません。撮影やメディアの扱いはありません。',
  'nav.label': 'メインメニュー',
  'nav.home': 'ホーム',
  'nav.settings': '開発設定',
  'nav.review': 'レビュー',
  'nav.consent': '同意と登録',
  'nav.convert': '新規変換',
  'lang.label': '言語',
  'home.heading': 'ようこそ',
  'home.body':
    'Familiar レビューAPIのリファレンスクライアントです。明示的な同意を得た保護者のみ、家族のコンテンツに親の声と顔を適用できます。同意ルールはすべてサーバーが強制し、このアプリはサーバーが許可した内容を表示するだけです。',
  'home.needSettings': 'まず開発設定で家族IDと保護者IDを設定してください。',
  'settings.heading': '開発設定（スタブ認証）',
  'settings.warning':
    'これらの値は x-family-id と x-guardian-id ヘッダーとして送信されます。認証情報ではありません。秘密情報は入力しないでください。',
  'settings.baseUrl': 'APIのベースURL',
  'settings.familyId': '家族ID',
  'settings.guardianId': '保護者ID',
  'settings.save': '保存',
  'settings.saved': '保存しました。',
  'settings.check': 'APIの接続を確認',
  'settings.healthOk': 'APIに接続できました。',
  'settings.healthFail': 'APIに接続できません。',
  'error.generic': 'エラーが発生しました（{code}）。',
  'error.missing_auth_headers': '開発設定で家族IDと保護者IDを設定してください。',
  'error.wrong_family': '別の家族のデータです。リクエストは拒否されました。',
  'error.network_error': 'APIに接続できません。',
};

export type Locale = 'en' | 'ja';
export const catalogs: Record<Locale, Record<MessageKey, string>> = { en, ja };
