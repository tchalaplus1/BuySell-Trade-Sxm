# iOS Cloud Build Sans Mac

Ce projet peut etre compile pour iPhone avec GitHub Actions sur macOS, sans avoir de Mac personnel.

## Ce qui est deja pret

```text
App name: Buy Sell Trade SXM
Bundle ID: com.tchalaplus.mobile
Apple Team ID: CJ7X9S5JDT
Workflow: .github/workflows/mobile-ios-cloud.yml
```

## Test rapide sans secrets Apple

Dans GitHub:

1. Ouvrir le repo.
2. Aller dans `Actions`.
3. Choisir `Mobile iOS Cloud Build`.
4. Cliquer `Run workflow`.
5. Choisir `simulator`.

Ce test verifie que le projet iOS compile dans le cloud. Il ne donne pas une app installable sur iPhone.

## Build iPhone pour TestFlight / App Store

Pour produire un IPA signe et l'envoyer a App Store Connect, il faut ajouter ces secrets dans GitHub:

```text
IOS_DISTRIBUTION_CERTIFICATE_BASE64
IOS_DISTRIBUTION_CERTIFICATE_PASSWORD
IOS_KEYCHAIN_PASSWORD
IOS_APP_STORE_PROFILE_BASE64
IOS_APP_STORE_PROFILE_NAME
APP_STORE_CONNECT_KEY_ID
APP_STORE_CONNECT_ISSUER_ID
APP_STORE_CONNECT_API_KEY_BASE64
```

Ensuite:

1. Ouvrir le repo GitHub.
2. Aller dans `Settings` > `Secrets and variables` > `Actions`.
3. Ajouter les secrets.
4. Aller dans `Actions` > `Mobile iOS Cloud Build`.
5. Cliquer `Run workflow`.
6. Choisir `app-store`.

Le workflow cree un IPA signe, le garde comme artifact GitHub, puis l'envoie vers App Store Connect si les secrets API Apple sont presents.

## D'ou viennent les secrets Apple

Ces fichiers/informations viennent du compte Apple Developer:

```text
IOS_DISTRIBUTION_CERTIFICATE_BASE64:
  Fichier .p12 du certificat Apple Distribution, converti en base64.

IOS_DISTRIBUTION_CERTIFICATE_PASSWORD:
  Mot de passe du fichier .p12.

IOS_KEYCHAIN_PASSWORD:
  Mot de passe temporaire pour le keychain GitHub Actions.
  Choisir un nouveau mot de passe fort.

IOS_APP_STORE_PROFILE_BASE64:
  Fichier .mobileprovision App Store pour com.tchalaplus.mobile, converti en base64.

IOS_APP_STORE_PROFILE_NAME:
  Nom exact du provisioning profile App Store.

APP_STORE_CONNECT_KEY_ID:
  Key ID de la cle API App Store Connect.

APP_STORE_CONNECT_ISSUER_ID:
  Issuer ID App Store Connect.

APP_STORE_CONNECT_API_KEY_BASE64:
  Fichier AuthKey_XXXX.p8 de App Store Connect, converti en base64.
```

## Commandes Windows pour convertir en base64

Depuis PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\file.p12")) | Set-Clipboard
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\profile.mobileprovision")) | Set-Clipboard
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\AuthKey_KEYID.p8")) | Set-Clipboard
```

Colle ensuite le resultat dans le secret GitHub correspondant.

## Important

Android peut etre build et teste sur ce PC Windows.

iOS peut etre prepare ici, mais Apple exige un build macOS/Xcode. GitHub Actions fournit ce Mac dans le cloud.
