import { defineMessages } from '../locale'

// Passkeys (components/add-passkey, passkey-login, and passkeyErrorMessage in lib/supabase/client.ts)
export const auth = defineMessages({
  zh: {
    signIn: '用 passkey 登录',
    signingIn: '验证中…',
    add: '添加 passkey',
    adding: '等待验证…',
    otherDevice: '其他设备',
    addedOn: (device: string) => `${device} 上添加`,
    errors: {
      localhost: 'passkey 只能在正式网址上使用。本地开发请用邮件登录。',
      rpId: (host: string, rpId: string | null) => `当前网址是 ${host}，但 Supabase 里设置的 RP ID 是 ${rpId ?? '（未知）'}，两者必须完全一致。`,
      registered: '这台设备（或同一个 iCloud 钥匙串）已经添加过 passkey 了。',
      expired: '等待时间太长了，请再点一次。',
      disabled: 'Supabase 后台还没有打开 Passkey。先用邮件登录。',
      other: (code: string) => `出错了（${code}）`,
    },
  },
  en: {
    signIn: 'Sign in with a passkey',
    signingIn: 'Verifying…',
    add: 'Add a passkey',
    adding: 'Waiting for verification…',
    otherDevice: 'another device',
    addedOn: (device: string) => `Added on ${device}`,
    errors: {
      localhost: 'Passkeys only work on the production address. Use the email link for local development.',
      rpId: (host: string, rpId: string | null) =>
        `This site is ${host}, but the RP ID set in Supabase is ${rpId ?? '(unknown)'}. The two must match exactly.`,
      registered: 'This device (or the same iCloud Keychain) already has a passkey.',
      expired: 'That took too long. Please try again.',
      disabled: 'Passkeys are not enabled in Supabase yet. Use the email link for now.',
      other: (code: string) => `Something went wrong (${code})`,
    },
  },
  ja: {
    signIn: 'パスキーでログイン',
    signingIn: '確認中…',
    add: 'パスキーを追加',
    adding: '確認を待っています…',
    otherDevice: 'その他の端末',
    addedOn: (device: string) => `${device} で追加`,
    errors: {
      localhost: 'パスキーは本番のアドレスでのみ使えます。ローカル開発ではメールでログインしてください。',
      rpId: (host: string, rpId: string | null) =>
        `現在のアドレスは ${host} ですが、Supabase に設定された RP ID は ${rpId ?? '（不明）'} です。完全に一致している必要があります。`,
      registered: 'この端末（または同じ iCloud キーチェーン）にはすでにパスキーがあります。',
      expired: '時間がかかりすぎました。もう一度お試しください。',
      disabled: 'Supabase でパスキーがまだ有効になっていません。まずはメールでログインしてください。',
      other: (code: string) => `エラーが発生しました（${code}）`,
    },
  },
})
