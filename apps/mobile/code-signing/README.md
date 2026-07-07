# code-signing —— OTA 更新的代码签名证书

这里放 **OTA 热更的代码签名公钥证书** `certificate.pem`。它会被打进 autotk（app.json 的
`updates.codeSigningCertificate` 已引用），手机用它验证「更新包确实是卖家私钥签的」——
防更新服务器被黑/DNS 劫持推恶意 JS。

## 首次构建前必做（Mac，一次性）

```bash
cd apps/mobile
npx expo-updates codesigning:generate-keypair \
  --key-output-directory code-signing \
  --certificate-output-directory code-signing
```

产出两个文件：
- `certificate.pem` —— **留在这里**，随 App 一起打包（公钥，可提交）。
- `private-key.pem` —— **移到更新服务器**（`services/update-server` 的 `data/secrets/`），
  **绝不打进 App、绝不提交**（已被 .gitignore 挡住）。

> ⚠️ 没有 `certificate.pem` 时，`expo export` / `expo prebuild` 会因 app.json 引用了不存在的证书而失败——
> 所以这一步必须在首次 prebuild/出包**之前**做。
>
> 若这次交付不想接代码签名：把 app.json 里 `updates.codeSigningCertificate` 和
> `codeSigningMetadata` 两行删掉即可（仅靠 HTTPS 传输安全；日后想加需重出包）。
