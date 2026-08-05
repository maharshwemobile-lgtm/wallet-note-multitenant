# Wallet Note

**အခမဲ့အသုံးပြုနိုင်သော Multi-tenant Wallet Note၊ Mini Mart POS နှင့် 3D
မှတ်တမ်းစနစ်**

[Live App](https://walletnote.maharshwe.online) |
[Latest Release](https://github.com/maharshwemobile-lgtm/wallet-note-multitenant/releases/latest) |
[VPS Handoff Prompt](PROJECT_PROMPT.md)

Wallet Note သည် ချဲမှတ်တမ်း၊ ငွေလွှဲမှတ်တမ်းနှင့် အသေးစားလုပ်ငန်းစာရင်းများ
မှတ်သားလိုသူများအပြင် Mini Mart ဖွင့်ထားသူများပါ အသုံးပြုနိုင်သော Web App
ဖြစ်ပါတယ်။ လူတိုင်းအခမဲ့ Register လုပ်နိုင်ပြီး Account တစ်ခုချင်းစီ၏ Data ကို
PostgreSQL Database တွင် သီးသန့်ခွဲထားပါတယ်။

English: Wallet Note is a free multi-tenant business-record, 3D-management, and
Mini Mart POS web application. Every registered business has an isolated
PostgreSQL workspace.

## အဓိကလုပ်ဆောင်ချက်များ

- **Wallet Note Mode** - ငွေစာရင်း၊ ငွေလွှဲ၊ အကြွေးရရန်/ပေးရန်နှင့်
  ဝင်ငွေ/ထွက်ငွေ မှတ်တမ်းများ
- **Mini Mart Mode** - အရောင်းနှင့် POS၊ ကုန်ပစ္စည်း၊ Stock၊ အဝယ်နှင့်
  Supplier စီမံခန့်ခွဲမှု
- **3D မှတ်တမ်းများ** - Session၊ Bulk Entry၊ Exposure၊ Settlement၊ Result
  History နှင့် CSV Template Export/Import
- **Multi-wallet Ledger** - Wallet လက်ကျန်ပြောင်းလဲမှုအားလုံးကို Ledger
  Entry ဖြင့် စနစ်တကျသိမ်းဆည်းခြင်း
- **Customer Credit & Payable** - အကြွေးရရန်၊ ပေးရန်နှင့် အရစ်ကျငွေသွင်းမှု
- **Reports & Audit Logs** - Report များ၊ CSV Export နှင့် လုပ်ဆောင်ချက်
  မှတ်တမ်းများ
- **Users & Roles** - Owner၊ Admin၊ Agent၊ Cashier၊ Accountant၊ Viewer နှင့်
  Custom Permission များ
- **PWA & Mobile View** - ဖုန်းနှင့် Desktop နှစ်မျိုးလုံးအဆင်ပြေပြီး
  Home Screen သို့ App အဖြစ်ထည့်သွင်းနိုင်ခြင်း
- **Myanmar / English** - မြန်မာနှင့် အင်္ဂလိပ် Language ပြောင်းလဲအသုံးပြုနိုင်ခြင်း

## Data လုံခြုံရေး

- Business တစ်ခုချင်းစီ၏ Data ကို `businessId` ဖြင့် သီးသန့်ခွဲထားပါတယ်။
- Branch၊ Session နှင့် User Permission ကို API Server ဘက်တွင် စစ်ဆေးပါတယ်။
- အရေးကြီးသော Save၊ Update၊ Delete၊ Import၊ Settlement နှင့် Admin
  လုပ်ဆောင်ချက်များကို Audit Log မှတ်တမ်းတင်ပါတယ်။
- ငွေကြေးပမာဏများကို Floating-point မသုံးဘဲ `BigInt` minor units ဖြင့်
  သိမ်းဆည်းပါတယ်။
- Database အပြောင်းအလဲအများစုကို Transaction အတွင်း အပြီးလုပ်ဆောင်ပါတယ်။

### Admin panel (`/admin`)

**Admin passcode ဆိုတာ မရှိပါဘူး။** ဘာမှ ရိုက်ထည့်စရာ မလိုပါ — ဝင်ခွင့်က
Login ဝင်ထားတဲ့ အကောင့်ပေါ်မှာပဲ မူတည်ပါတယ်။ ရှေ့က `ADMIN_SECRET` header
စနစ်ကို လုံးဝ ဖျက်လိုက်ပါပြီ။

ဒါပေမဲ့ ဒီစာမျက်နှာက **လုံးဝ ဖွင့်ထားလို့ မရပါဘူး** — Business အားလုံးရဲ့
နာမည်၊ အသုံးပြုသူများနှင့် Audit မှတ်တမ်းများကို ပြသလို့ပါ။ အဲဒါတွေက
တခြားလူတွေရဲ့ Data ဖြစ်ပြီး ကျွန်ုပ်တို့ ထုတ်ပြခွင့် မရှိပါဘူး။

ဒါကြောင့် ဝင်ခွင့်ရှိသူများကို `ADMIN_USERS` environment variable ထဲမှာ
username သို့မဟုတ် email နဲ့ တိုက်ရိုက် စာရင်းပြုစုထားပါတယ် (comma ခြားပါ):

```
ADMIN_USERS=khunmyintaung,khunmyintaung@gmail.com
```

မသတ်မှတ်ထားရင် **ဘယ်သူမှ မဝင်နိုင်ပါဘူး**။ Setting တစ်ခု ကျန်ခဲ့တာနဲ့
စာမျက်နှာက အားလုံးအတွက် ပွင့်သွားတာမျိုး မဖြစ်စေဖို့ပါ။

မှတ်ချက် — အကောင့်တိုင်းက ကိုယ့်လုပ်ငန်းရဲ့ Owner ဖြစ်လို့ "Owner ဖြစ်ရင်
ရပြီ" ဆိုတဲ့ စစ်ဆေးမှုက မလုံလောက်ပါဘူး။ Google နဲ့ ဘယ်သူမဆို အကောင့်
ဖွင့်လို့ရတဲ့အတွက် အဲဒါဆိုရင် လူတိုင်း ဝင်လို့ရသွားပါမယ်။

## Developer

<img src="public/khun-myint-aung.jpg" alt="Khun Myint Aung" width="180">

| အချက်အလက် | အသေးစိတ် |
| --- | --- |
| Developer | **Khun Myint Aung** |
| Organization | **Mahar Shwe Mobile** |
| Location | Hsisheng Township, Shan State, Taunggyi |
| Facebook | [My Choice My Life](https://www.facebook.com/Mychoicemylife2018) |
| Telegram | [@Mylifemychoice68](https://t.me/Mylifemychoice68) |
| Community | [Telegram Community](https://t.me/+2gc9ml7iMgk1ZThl) |
| TikTok | [@maharshwemobile](https://www.tiktok.com/@maharshwemobile) |
| Website | [maharshwe.online](https://maharshwe.online/) |

ဒီ Project ကို Community အတွက် အခမဲ့မျှဝေထားပါတယ်။ Bug Report၊ အကြံပြုချက်နှင့်
အသုံးပြုနည်းမေးမြန်းမှုများကို Facebook သို့မဟုတ် Telegram Community မှတစ်ဆင့်
ဆက်သွယ်နိုင်ပါတယ်။

## Technology

- Next.js App Router
- React and TypeScript
- Tailwind CSS
- Prisma ORM
- PostgreSQL
- Zod validation
- Vitest
- PM2 and Nginx production deployment

## Local Development

လိုအပ်ချက်များ:

- Node.js 20 or newer
- PostgreSQL
- Git

```powershell
git clone https://github.com/maharshwemobile-lgtm/wallet-note-multitenant.git
cd wallet-note-multitenant
npm install
Copy-Item .env.example .env
```

`.env` ထဲမှ `DATABASE_URL` နှင့် `AUTH_SECRET` ကို ကိုယ့် Local Development
Environment အတွက်သာ ဖြည့်ပါ။ Production secret များကို မသုံးပါနှင့်။

```powershell
npx prisma migrate dev
npx prisma db seed
npm run dev
```

Browser တွင် [http://localhost:3000](http://localhost:3000) ကိုဖွင့်ပါ။

### Development Seed Accounts

အောက်ပါ Account များသည် Local Development Seed Data အတွက်သာဖြစ်ပါတယ်။
Production တွင် လုံးဝမသုံးရပါ။

| Username | Role | Password |
| --- | --- | --- |
| `owner` | Owner | `Password123!` |
| `admin` | Admin | `Password123!` |
| `agent` | Agent | `Password123!` |
| `accountant` | Accountant | `Password123!` |

## Quality Checks

```powershell
npm run lint
npm test
npm run build
git diff --check
```

## Project Structure

```text
src/
  app/          Next.js pages and REST API routes
  components/   UI components, AppShell, language and PWA controls
  lib/          Authentication, tenant, money and utility functions
  services/     Wallet, POS, 3D, exchange and accounting logic
prisma/         PostgreSQL schema, migrations and seed data
tests/          Automated tests
public/         Public images, icons and PWA assets
```

## VPS Recovery

Windows ပြန်တင်ခြင်း သို့မဟုတ် Development PC ပြောင်းလဲခြင်းအတွက်
[PROJECT_PROMPT.md](PROJECT_PROMPT.md) ကိုဖတ်ပါ။ အဲဒီဖိုင်တွင် GitHub ကနေ Source
ပြန်ယူခြင်း၊ VPS ရှိ လက်ရှိ PM2/Nginx Release ကိုရှာခြင်း၊ Candidate Deployment
စမ်းသပ်ခြင်းနှင့် အခြား VPS Project များကို မထိရမည့်စည်းမျဉ်းများ ပါဝင်ပါတယ်။

SSH private key၊ `.env.production`၊ Database URL၊ API Key၊ Password နှင့် Token
များကို GitHub ထဲ မတင်ပါနှင့်။

## License

ဤ Project ကို [MIT License](LICENSE) ဖြင့် အခမဲ့အသုံးပြု၊ ပြင်ဆင်နှင့်
မျှဝေနိုင်ပါတယ်။ မူရင်း Copyright နှင့် License Notice ကို ဆက်လက်ထည့်သွင်းထားရပါမယ်။

Copyright (c) 2026 Khun Myint Aung.
