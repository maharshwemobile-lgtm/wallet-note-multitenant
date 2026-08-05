"use client";

import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { Languages } from "lucide-react";
import { cn } from "./ui";

type Language = "en" | "mm";

const LanguageContext = createContext<{
  language: Language;
  setLanguage: (language: Language) => void;
}>({ language: "en", setLanguage: () => {} });

const MM: Record<string, string> = {
  "Dashboard": "ပင်မစာမျက်နှာ",
  "Sales & POS": "အရောင်းနှင့် POS",
  "Purchases": "အဝယ်",
  "Items": "ကုန်ပစ္စည်းများ",
  "Stock": "ကုန်လက်ကျန်",
  "3D Records": "3D မှတ်တမ်းများ",
  "Exchange": "ငွေလဲလှယ်",
  "Wallets": "ငွေစာရင်းများ",
  "Transfer": "ငွေလွှဲ",
  "Withdraw": "ငွေထုတ်",
  "Credit & Payable": "အကြွေးရရန်/ပေးရန်",
  "Income & Expense": "ဝင်ငွေ/ထွက်ငွေ",
  "Reports": "အစီရင်ခံစာ",
  "Customers": "ဖောက်သည်များ",
  "Suppliers": "ကုန်သွင်းသူများ",
  "Users & Roles": "အသုံးပြုသူနှင့် အခန်းကဏ္ဍ",
  "Settings": "ဆက်တင်များ",
  "Audit Logs": "စစ်ဆေးမှတ်တမ်း",
  "About Us": "ကျွန်ုပ်တို့အကြောင်း",
  "Sign in to your account": "သင့်အကောင့်သို့ ဝင်ရောက်ပါ",
  "Username or email": "အသုံးပြုသူအမည် သို့မဟုတ် အီးမေးလ်",
  "Username": "အသုံးပြုသူအမည်",
  "Password": "စကားဝှက်",
  "Sign in": "ဝင်မည်",
  "Signing in…": "ဝင်ရောက်နေသည်…",
  "New to Wallet Note?": "Wallet Note အသုံးပြုသူအသစ်လား?",
  "Create a free account": "အခမဲ့အကောင့်ဖွင့်မည်",
  "Create your Wallet Note": "သင့် Wallet Note ကိုဖန်တီးပါ",
  "Free private workspace for your business": "သင့်လုပ်ငန်းအတွက် အခမဲ့သီးသန့်နေရာ",
  "Business name": "လုပ်ငန်းအမည်",
  "Your name": "သင့်အမည်",
  "Phone": "ဖုန်း",
  "Main currency": "အဓိကငွေကြေး",
  "Email": "အီးမေးလ်",
  "Confirm password": "စကားဝှက်အတည်ပြု",
  "Use at least 8 characters.": "အနည်းဆုံး စာလုံး ၈ လုံးသုံးပါ။",
  "Create free account": "အခမဲ့အကောင့်ဖွင့်မည်",
  "Creating account...": "အကောင့်ဖန်တီးနေသည်...",
  "Already have an account?": "အကောင့်ရှိပြီးသားလား?",
  "Enable Mini Mart functions?": "Mini Mart လုပ်ဆောင်ချက်များ ဖွင့်မလား?",
  "Turn this on for items, stock, purchases, suppliers, and Sales & POS.": "ကုန်ပစ္စည်း၊ လက်ကျန်၊ အဝယ်၊ ကုန်သွင်းသူနှင့် POS အတွက် ဖွင့်ပါ။",
  "Wallet Note only": "Wallet Note သာ",
  "Enable Mini Mart": "Mini Mart ဖွင့်မည်",
  "Install App": "App ထည့်သွင်းမည်",
  "Install Wallet Note": "Wallet Note ထည့်သွင်းရန်",
  "Done": "ပြီးပြီ",
  "Toggle theme": "အရောင်ပုံစံပြောင်းရန်",
  "Sign out": "ထွက်မည်",
  "New transaction": "မှတ်တမ်းအသစ်",
  "Save": "သိမ်းမည်",
  "Saving…": "သိမ်းနေသည်…",
  "Save records": "မှတ်တမ်းများသိမ်းမည်",
  "Cancel": "မလုပ်တော့ပါ",
  "Close": "ပိတ်မည်",
  "Create": "ဖန်တီးမည်",
  "Update": "ပြင်ဆင်မည်",
  "Delete": "ဖျက်မည်",
  "Edit": "ပြင်မည်",
  "Add": "ထည့်မည်",
  "Search": "ရှာဖွေမည်",
  "Confirm": "အတည်ပြုမည်",
  "Submit": "တင်သွင်းမည်",
  "Reopen": "ပြန်ဖွင့်မည်",
  "Reverse": "ပြန်လှန်မည်",
  "Adjust": "ညှိနှိုင်းမည်",
  "View": "ကြည့်မည်",
  "Active": "အသုံးပြုနေ",
  "Inactive": "ပိတ်ထား",
  "OPEN": "ဖွင့်ထား",
  "CLOSED": "ပိတ်ပြီး",
  "SETTLED": "စာရင်းရှင်းပြီး",
  "PENDING": "စောင့်ဆိုင်း",
  "COMPLETED": "ပြီးစီး",
  "CANCELLED": "ပယ်ဖျက်ပြီး",
  "REVERSED": "ပြန်ရုပ်သိမ်းပြီး",
  "VOIDED": "ပယ်ဖျက်ပြီး",
  "WITHDRAW": "ငွေထုတ်",
  "CASH": "ငွေသား",
  "PAID": "ပေးချေပြီး",
  "UNPAID": "မပေးချေရသေး",
  "PARTIAL": "တစ်စိတ်တစ်ပိုင်း",
  "INCOME": "ဝင်ငွေ",
  "EXPENSE": "ထွက်ငွေ",
  "CUSTOMER": "ဖောက်သည်",
  "SUPPLIER": "ကုန်သွင်းသူ",
  "Name": "အမည်",
  "Full name": "အမည်အပြည့်အစုံ",
  "Code": "ကုဒ်",
  "Type": "အမျိုးအစား",
  "Currency": "ငွေကြေး",
  "Branch": "ဆိုင်ခွဲ",
  "Role": "အခန်းကဏ္ဍ",
  "Status": "အခြေအနေ",
  "Actions": "လုပ်ဆောင်ချက်များ",
  "Date": "ရက်စွဲ",
  "From": "မှ",
  "To": "အထိ",
  "Amount": "ငွေပမာဏ",
  "Quantity": "အရေအတွက်",
  "Price": "ဈေးနှုန်း",
  "Total": "စုစုပေါင်း",
  "Balance": "လက်ကျန်",
  "Profit": "အမြတ်",
  "Payment": "ပေးချေမှု",
  "Payment status": "ပေးချေမှုအခြေအနေ",
  "Transaction": "ငွေလွှဲမှတ်တမ်း",
  "Transactions": "ငွေလွှဲမှတ်တမ်းများ",
  "Fee": "ဝန်ဆောင်ခ",
  "Notes": "မှတ်ချက်",
  "Description": "ဖော်ပြချက်",
  "Reference": "ရည်ညွှန်းချက်",
  "Address": "လိပ်စာ",
  "Telegram": "တယ်လီဂရမ်",
  "Website": "ဝဘ်ဆိုက်",
  "Category": "အမျိုးအစား",
  "Unit": "ယူနစ်",
  "Barcode": "ဘားကုဒ်",
  "Reason (required)": "အကြောင်းပြချက် (မဖြစ်မနေ)",
  "Due date": "ပေးချေရမည့်ရက်",
  "Opening balance": "အစလက်ကျန်",
  "Current balance": "လက်ရှိလက်ကျန်",
  "Minimum balance alert": "အနည်းဆုံးလက်ကျန် သတိပေးချက်",
  "From wallet": "ထွက်မည့်ငွေစာရင်း",
  "To wallet": "ဝင်မည့်ငွေစာရင်း",
  "Cash wallet": "ငွေသားစာရင်း",
  "Txn": "မှတ်တမ်းနံပါတ်",
  "Reason": "အကြောင်းပြချက်",
  "Reason / note": "အကြောင်းပြချက် / မှတ်ချက်",
  "Void": "ပယ်ဖျက်",
  "Saving...": "သိမ်းဆည်းနေသည်...",
  "Money Transfer": "ငွေလွှဲပြောင်းခြင်း",
  "New transfer": "ငွေလွှဲအသစ်",
  "Reverse transfer": "ငွေလွှဲကို ပြန်ရုပ်သိမ်းရန်",
  "Confirm transfer": "ငွေလွှဲရန် အတည်ပြုမည်",
  "Transferring...": "ငွေလွှဲနေသည်...",
  "Transfer completed": "ငွေလွှဲပြီးပါပြီ",
  "Transfer failed": "ငွေလွှဲ၍ မရပါ",
  "Transfer reversed": "ငွေလွှဲကို ပြန်ရုပ်သိမ်းပြီးပါပြီ",
  "Reverse failed": "ပြန်ရုပ်သိမ်း၍ မရပါ",
  "No transfers yet": "ငွေလွှဲမှတ်တမ်း မရှိသေးပါ",
  "New withdrawal": "ငွေထုတ်အသစ်",
  "Void withdrawal": "ငွေထုတ်ကို ပယ်ဖျက်ရန်",
  "Confirm withdrawal": "ငွေထုတ်ရန် အတည်ပြုမည်",
  "Withdrawal recorded": "ငွေထုတ် မှတ်တမ်းတင်ပြီးပါပြီ",
  "Withdrawal failed": "ငွေထုတ်၍ မရပါ",
  "Withdrawal voided": "ငွေထုတ်ကို ပယ်ဖျက်ပြီးပါပြီ",
  "Void failed": "ပယ်ဖျက်၍ မရပါ",
  "No withdrawals yet": "ငွေထုတ်မှတ်တမ်း မရှိသေးပါ",
  "Direction": "ငွေဝင်/ထွက်",
  "Wallet": "ငွေစာရင်း",
  "New wallet": "ငွေစာရင်းအသစ်",
  "Wallet transfer": "ငွေစာရင်းအချင်းချင်းလွှဲရန်",
  "New user": "အသုံးပြုသူအသစ်",
  "New custom role": "အခန်းကဏ္ဍအသစ်",
  "Role name": "အခန်းကဏ္ဍအမည်",
  "New supplier": "ကုန်သွင်းသူအသစ်",
  "New contact": "အဆက်အသွယ်အသစ်",
  "New item": "ကုန်ပစ္စည်းအသစ်",
  "Categories & Units": "အမျိုးအစားနှင့် ယူနစ်",
  "Cost price": "ဝယ်ဈေး",
  "Selling price": "ရောင်းဈေး",
  "Min stock": "အနည်းဆုံးလက်ကျန်",
  "New purchase": "အဝယ်အသစ်",
  "Supplier": "ကုန်သွင်းသူ",
  "Discount": "လျှော့ဈေး",
  "Paid now": "ယခုပေးချေငွေ",
  "Pay from wallet": "ပေးချေမည့်ငွေစာရင်း",
  "New income / expense": "ဝင်ငွေ/ထွက်ငွေ အသစ်",
  "New exchange transaction": "ငွေလဲလှယ်မှုအသစ်",
  "Service fee (MMK)": "ဝန်ဆောင်ခ (MMK)",
  "3D Sessions": "3D အကြိမ်များ",
  "New session": "အကြိမ်အသစ်",
  "Export / Import": "Export / Import",
  "3D records export / import": "3D မှတ်တမ်း Export / Import",
  "Export selected session": "ရွေးထားသောအကြိမ်ကို Export လုပ်မည်",
  "Download import template": "Import Template ယူမည်",
  "Import branch": "Import ထည့်မည့်ဆိုင်ခွဲ",
  "Completed template CSV": "ဖြည့်ပြီးသော Template CSV",
  "Download the import template first.": "Import Template ကို အရင်ယူပါ။",
  "Importing...": "Import လုပ်နေသည်...",
  "New 3D session": "3D အကြိမ်အသစ်",
  "Session": "အကြိမ်",
  "Session name": "အကြိမ်အမည်",
  "Draw date": "ထွက်မည့်ရက်",
  "Draw time": "ထွက်မည့်အချိန်",
  "Cut-off time": "ပိတ်မည့်အချိန်",
  "Default odds (payout multiplier)": "မူလအလျော်",
  "Result": "ထွက်ဂဏန်း",
  "Records": "မှတ်တမ်းများ",
  "Total bet": "စုစုပေါင်းထိုးငွေ",
  "Exposure": "ပေးလျော်နိုင်ခြေ",
  "Official 3D result history": "တရားဝင် 3D ထွက်ဂဏန်းမှတ်တမ်း",
  "Official result history is waiting for the API provider.": "API မှ ထွက်ဂဏန်းမှတ်တမ်းကို စောင့်ဆိုင်းနေသည်။",
  "Official": "တရားဝင်",
  "Time": "အချိန်",
  "Morning": "မနက်ပိုင်း",
  "Evening": "ညနေပိုင်း",
  "New records": "မှတ်တမ်းအသစ်",
  "New 3D records": "3D မှတ်တမ်းအသစ်",
  "Customer name (optional)": "ဖောက်သည်အမည် (မထည့်လည်းရ)",
  "Phone (optional)": "ဖုန်း (မထည့်လည်းရ)",
  "Commission % (optional)": "ကော်မရှင် % (မထည့်လည်းရ)",
  "Enter result & settle": "ထွက်ဂဏန်းထည့်ပြီး စာရင်းရှင်းမည်",
  "Winning number (3 digits)": "ပေါက်ဂဏန်း (၃ လုံး)",
  "Preview settlement": "စာရင်းရှင်းမှုကြိုကြည့်မည်",
  "Reopen settlement": "စာရင်းရှင်းမှု ပြန်ဖွင့်မည်",
  "Close session": "အကြိမ်ပိတ်မည်",
  "Reopen entry": "ထိုးစာရင်းပြန်ဖွင့်မည်",
  "Total commission": "စုစုပေါင်းကော်မရှင်",
  "Potential payout": "ပေးလျော်နိုင်သည့်ငွေ",
  "Settlement result": "စာရင်းရှင်းရလဒ်",
  "Gross collected": "စုစုပေါင်းရငွေ",
  "Winning payout": "ပေါက်ဂဏန်းပေးလျော်ငွေ",
  "Net profit/loss": "အသားတင်အမြတ်/အရှုံး",
  "Customer": "ဖောက်သည်",
  "Customers owe us": "ဖောက်သည်ထံမှ ရရန်",
  "We owe suppliers": "ကုန်သွင်းသူသို့ ပေးရန်",
  "Total income": "စုစုပေါင်းဝင်ငွေ",
  "Total expense": "စုစုပေါင်းထွက်ငွေ",
  "Total sales": "စုစုပေါင်းအရောင်း",
  "Total profit": "စုစုပေါင်းအမြတ်",
  "Today's Sales": "ယနေ့အရောင်း",
  "Sales Profit": "အရောင်းအမြတ်",
  "Total MMK Balance": "MMK စုစုပေါင်းလက်ကျန်",
  "Total THB Balance": "THB စုစုပေါင်းလက်ကျန်",
  "Customer Receivable": "ဖောက်သည်ထံမှ ရရန်",
  "Business Payable": "လုပ်ငန်းမှ ပေးရန်",
  "Today's Income": "ယနေ့ဝင်ငွေ",
  "Today's Expense": "ယနေ့ထွက်ငွေ",
  "Net Cash Movement": "အသားတင်ငွေ အဝင်/အထွက်",
  "No records yet": "မှတ်တမ်းမရှိသေးပါ",
  "No wallets yet": "ငွေစာရင်းမရှိသေးပါ",
  "No items found": "ကုန်ပစ္စည်းမတွေ့ပါ",
  "No customers found": "ဖောက်သည်မတွေ့ပါ",
  "No suppliers found": "ကုန်သွင်းသူမတွေ့ပါ",
  "No transactions found": "ငွေလွှဲမှတ်တမ်းမတွေ့ပါ",
  "No sessions yet. Create the first draw session.": "3D အကြိမ်မရှိသေးပါ။ ပထမအကြိမ်ဖန်တီးပါ။",
  "Search name or phone…": "အမည် သို့မဟုတ် ဖုန်းဖြင့်ရှာရန်…",
  "Search supplier name or phone...": "ကုန်သွင်းသူအမည် သို့မဟုတ် ဖုန်းဖြင့်ရှာရန်…",
  "Search name, SKU, or barcode…": "အမည်၊ SKU သို့မဟုတ် ဘားကုဒ်ဖြင့်ရှာရန်…",
  "Search or scan barcode…": "ရှာရန် သို့မဟုတ် ဘားကုဒ်ဖတ်ရန်…",
  "3D Settled P/L": "3D စာရင်းရှင်း အမြတ်/အရှုံး",
  "3D Total Today": "ယနေ့ 3D စုစုပေါင်း",
  "3D commission %": "3D ကော်မရှင် %",
  "3D profit": "3D အမြတ်",
  "3D records": "3D မှတ်တမ်းများ",
  "3D settings": "3D ဆက်တင်များ",
  "3D volume": "3D ထိုးငွေပမာဏ",
  "Actual counted balance": "အမှန်တကယ်ရေတွက်ထားသောလက်ကျန်",
  "Add money (debit)": "ငွေထည့်မည်",
  "Adjust balance": "လက်ကျန်ညှိမည်",
  "Adjustment (+ to add, − to remove)": "ညှိမည့်ပမာဏ (+ ထည့်၊ − နုတ်)",
  "All branches": "ဆိုင်ခွဲအားလုံး",
  "All modules": "လုပ်ဆောင်ချက်အားလုံး",
  "All types": "အမျိုးအစားအားလုံး",
  "Amount received now": "ယခုရရှိငွေ",
  "App name": "App အမည်",
  "Auto refresh: 30 seconds": "စက္ကန့် ၃၀ တိုင်း အလိုအလျောက်ပြန်တင်မည်",
  "Branches": "ဆိုင်ခွဲများ",
  "Business profile": "လုပ်ငန်းအချက်အလက်",
  "Buy THB (pay MMK)": "THB ဝယ်မည် (MMK ပေး)",
  "Buy rate (we buy THB at)": "THB ဝယ်ဈေး",
  "Cancel purchase": "အဝယ်ပယ်ဖျက်မည်",
  "Cancel sale": "အရောင်းပယ်ဖျက်မည်",
  "Categories": "အမျိုးအစားများ",
  "Close a day": "တစ်နေ့တာပိတ်မည်",
  "Closing notes": "ပိတ်သိမ်းမှတ်ချက်",
  "Collected:": "ကောက်ခံရငွေ:",
  "Commission:": "ကော်မရှင်:",
  "Contact phone": "ဆက်သွယ်ရန်ဖုန်း",
  "Copyright": "မူပိုင်ခွင့်",
  "Create role": "အခန်းကဏ္ဍဖန်တီးမည်",
  "Create user": "အသုံးပြုသူဖန်တီးမည်",
  "Credit Collected Today": "ယနေ့အကြွေးကောက်ခံရငွေ",
  "Credit history": "အကြွေးမှတ်တမ်း",
  "Credit limit": "အကြွေးကန့်သတ်ချက်",
  "Current payable": "လက်ရှိပေးရန်",
  "Current receivable": "လက်ရှိရရန်",
  "Customers & Contacts": "ဖောက်သည်နှင့် အဆက်အသွယ်များ",
  "Daily Close": "နေ့စဉ်စာရင်းပိတ်",
  "Daily breakdown": "နေ့စဉ်အသေးစိတ်",
  "Daily income vs expense": "နေ့စဉ်ဝင်ငွေနှင့် ထွက်ငွေ",
  "Default commission %": "မူလကော်မရှင် %",
  "Default odds": "မူလအလျော်",
  "Developer": "ဖန်တီးသူ",
  "Developer / company": "ဖန်တီးသူ / ကုမ္ပဏီ",
  "Due date (unpaid part)": "ကျန်ငွေပေးချေရမည့်ရက်",
  "Exchange Buy (THB)": "THB ဝယ်ယူမှု",
  "Exchange Profit": "ငွေလဲအမြတ်",
  "Exchange Sell (THB)": "THB ရောင်းချမှု",
  "Exchange history": "ငွေလဲမှတ်တမ်း",
  "Exchange profit": "ငွေလဲအမြတ်",
  "Exchange records": "ငွေလဲမှတ်တမ်းများ",
  "Expense": "ထွက်ငွေ",
  "Expense category": "ထွက်ငွေအမျိုးအစား",
  "Export data (CSV)": "ဒေတာထုတ်ယူမည် (CSV)",
  "Exposure by number (highest first)": "ဂဏန်းအလိုက်ပေးလျော်နိုင်ခြေ (အများဆုံးမှ)",
  "Gross collected:": "စုစုပေါင်းရငွေ:",
  "History": "မှတ်တမ်း",
  "Income": "ဝင်ငွေ",
  "Income − Expense": "ဝင်ငွေ − ထွက်ငွေ",
  "Leading zeros are preserved: 001, 010 and 100 are different numbers.": "ရှေ့ဆုံးသုညကို ထိန်းထားမည်။ 001၊ 010 နှင့် 100 သည် မတူညီသောဂဏန်းများဖြစ်သည်။",
  "Lines": "စာရင်းကြောင်းများ",
  "Low stock alerts": "ကုန်လက်ကျန်နည်း သတိပေးချက်",
  "Low wallet balance alerts": "ငွေလက်ကျန်နည်း သတိပေးချက်",
  "Max amount per number": "ဂဏန်းတစ်လုံးအများဆုံးထိုးငွေ",
  "Mini Mart functions": "Mini Mart လုပ်ဆောင်ချက်များ",
  "Money Exchange": "ငွေလဲလှယ်",
  "Net movement:": "အသားတင်အဝင်/အထွက်:",
  "Net profit / loss": "အသားတင်အမြတ် / အရှုံး",
  "New entry": "မှတ်တမ်းအသစ်",
  "New exchange": "ငွေလဲအသစ်",
  "New role": "အခန်းကဏ္ဍအသစ်",
  "Next": "နောက်သို့",
  "No pending sessions": "စောင့်ဆိုင်းနေသောအကြိမ်မရှိပါ",
  "No wallet movement": "ငွေစာရင်းမရွှေ့ပါ",
  "Numbers — one per line as number=amount": "ဂဏန်းများ — တစ်ကြောင်းလျှင် ဂဏန်း=ငွေပမာဏ",
  "Open POS": "POS ဖွင့်မည်",
  "Original": "မူရင်း",
  "Other": "အခြား",
  "Paid": "ပေးချေပြီး",
  "Payable Paid Today": "ယနေ့ပေးရန် ပေးချေပြီး",
  "Pending 3D sessions": "စောင့်ဆိုင်းနေသော 3D အကြိမ်များ",
  "Preview summary": "အနှစ်ချုပ်ကြိုကြည့်မည်",
  "Previous": "နောက်သို့ပြန်",
  "Print": "ပုံနှိပ်မည်",
  "Profit:": "အမြတ်:",
  "Rate (MMK per 1 THB)": "နှုန်း (THB ၁ ဘတ်လျှင် MMK)",
  "Receive into wallet": "လက်ခံမည့်ငွေစာရင်း",
  "Recent 3D records": "လတ်တလော 3D မှတ်တမ်းများ",
  "Recent exchanges": "လတ်တလောငွေလဲမှတ်တမ်း",
  "Records:": "မှတ်တမ်းများ:",
  "Registration and user activity": "အကောင့်ဖွင့်မှုနှင့် အသုံးပြုမှု",
  "Remaining": "ကျန်ငွေ",
  "Remove money (credit)": "ငွေနုတ်မည်",
  "Reopen day": "နေ့စဉ်စာရင်းပြန်ဖွင့်မည်",
  "Reverse exchange transaction": "ငွေလဲမှတ်တမ်းပြန်လှန်မည်",
  "Sales": "အရောင်း",
  "Save changes": "ပြင်ဆင်ချက်များသိမ်းမည်",
  "Save profile": "လုပ်ငန်းအချက်အလက်သိမ်းမည်",
  "Save rate": "နှုန်းသိမ်းမည်",
  "Save reconciliation": "စာရင်းတိုက်မှုသိမ်းမည်",
  "Select customer…": "ဖောက်သည်ရွေးပါ…",
  "Select item…": "ကုန်ပစ္စည်းရွေးပါ…",
  "Select wallet…": "ငွေစာရင်းရွေးပါ…",
  "Select…": "ရွေးချယ်ပါ…",
  "Sell THB (receive MMK)": "THB ရောင်းမည် (MMK လက်ခံ)",
  "Sell rate (we sell THB at)": "THB ရောင်းဈေး",
  "Settlement wallet (optional — records net P/L movement)": "စာရင်းရှင်းမည့်ငွေစာရင်း (မထည့်လည်းရ)",
  "Subtotal": "စုစုပေါင်းခွဲ",
  "System balance:": "စနစ်လက်ကျန်:",
  "Tap items to add them": "ထည့်လိုသောကုန်ပစ္စည်းကို နှိပ်ပါ",
  "The unpaid amount becomes a customer credit record.": "မပေးချေရသေးသောငွေကို ဖောက်သည်အကြွေးအဖြစ် မှတ်တမ်းတင်မည်။",
  "Unit cost": "တစ်ယူနစ်ဝယ်ဈေး",
  "Units": "ယူနစ်များ",
  "Unsettled 3D": "မရှင်းရသေးသော 3D",
  "Update THB/MMK board rate": "THB/MMK နှုန်းပြင်မည်",
  "Update rate": "နှုန်းပြင်မည်",
  "Version": "ဗားရှင်း",
  "WIN": "ပေါက်",
  "Wallets & cash": "ငွေစာရင်းနှင့် ငွေသား",
  "Warning threshold": "သတိပေးမည့်ပမာဏ",
  "We buy THB @": "THB ဝယ်ဈေး @",
  "We sell THB @": "THB ရောင်းဈေး @",
  "Winning payout:": "ပေါက်ဂဏန်းပေးလျော်ငွေ:",
  "Winning records": "ပေါက်သောမှတ်တမ်းများ",
  "Both wallet movements will be reversed. This action is logged.": "ငွေစာရင်းနှစ်ဖက်စလုံးကို ပြန်လှန်မည်။ ဤလုပ်ဆောင်ချက်ကို မှတ်တမ်းတင်ထားမည်။",
  "Changing the board rate never modifies existing transactions. Full history is kept.": "နှုန်းပြောင်းခြင်းသည် မှတ်တမ်းဟောင်းများကို မပြောင်းပါ။ နှုန်းမှတ်တမ်းအားလုံး သိမ်းထားမည်။",
  "Reopening allows transactions to be edited for this date again. The action is logged.": "ပြန်ဖွင့်ပြီးနောက် ဤရက်စွဲ၏မှတ်တမ်းများကို ပြန်ပြင်နိုင်မည်။ လုပ်ဆောင်ချက်ကို မှတ်တမ်းတင်ထားမည်။",
  "Stock and wallet payment are reversed. Logged in the audit trail.": "ကုန်လက်ကျန်နှင့် ငွေပေးချေမှုကို ပြန်လှန်ပြီး စစ်ဆေးမှတ်တမ်းတွင် သိမ်းထားမည်။",
};

const originalText = new WeakMap<Node, string>();
const originalAttributes = new WeakMap<Element, Map<string, string>>();

function translate(value: string) {
  const trimmed = value.trim();
  const exact = MM[trimmed];
  if (exact) return value.replace(trimmed, exact);
  const patterns: Array<[RegExp, (...matches: string[]) => string]> = [
    [/^Edit (.+)$/, (name) => `${name} ကိုပြင်မည်`],
    [/^Adjust (.+)$/, (name) => `${name} လက်ကျန်ညှိမည်`],
    [/^Reconcile (.+)$/, (name) => `${name} စာရင်းတိုက်မည်`],
    [/^Cancel (.+)$/, (name) => `${name} ကိုပယ်ဖျက်မည်`],
    [/^Pay (.+)$/, (name) => `${name} ကိုပေးချေမည်`],
    [/^Odds \(default (.+)\)$/, (odds) => `အလျော် (မူလ ${odds})`],
    [/^Records \((\d+)\)$/, (count) => `မှတ်တမ်းများ (${count})`],
    [/^Amount \((.+)\)$/, (currency) => `ငွေပမာဏ (${currency})`],
    [/^Customer \(owes (.+)\)$/, (amount) => `ဖောက်သည် (ပေးရန် ${amount})`],
  ];
  for (const [pattern, formatter] of patterns) {
    const match = trimmed.match(pattern);
    if (match) return value.replace(trimmed, formatter(...match.slice(1)));
  }
  return value;
}

function applyLanguage(root: ParentNode, language: Language) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    const current = node.nodeValue ?? "";
    const stored = originalText.get(node);
    if (!stored || (current !== stored && current !== translate(stored))) {
      originalText.set(node, current);
    }
    const original = originalText.get(node) ?? current;
    const next = language === "mm" ? translate(original) : original;
    if (current !== next) node.nodeValue = next;
    node = walker.nextNode();
  }

  const elements = root instanceof Element ? [root, ...root.querySelectorAll("*")] : [...root.querySelectorAll("*")];
  for (const element of elements) {
    for (const attribute of ["placeholder", "title", "aria-label"]) {
      const current = element.getAttribute(attribute);
      if (!current) continue;
      let stored = originalAttributes.get(element);
      if (!stored) {
        stored = new Map();
        originalAttributes.set(element, stored);
      }
      const original = stored.get(attribute);
      if (!original || (current !== original && current !== translate(original))) stored.set(attribute, current);
      const source = stored.get(attribute) ?? current;
      const next = language === "mm" ? translate(source) : source;
      if (current !== next) element.setAttribute(attribute, next);
    }
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");

  useEffect(() => {
    const saved = localStorage.getItem("wn-language");
    const frame = window.requestAnimationFrame(() => {
      if (saved === "mm") setLanguageState("mm");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language === "mm" ? "my" : "en";
    applyLanguage(document.body, language);
    let frame = 0;
    const observer = new MutationObserver(() => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        applyLanguage(document.body, language);
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [language]);

  function setLanguage(next: Language) {
    localStorage.setItem("wn-language", next);
    setLanguageState(next);
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function LanguageSwitch({ className }: { className?: string }) {
  const { language, setLanguage } = useContext(LanguageContext);
  return (
    <div
      className={cn(
        "inline-flex h-10 items-center rounded-lg border border-gray-200 bg-gray-50 p-0.5 dark:border-gray-700 dark:bg-gray-800",
        className
      )}
      aria-label="Language"
    >
      <Languages size={16} className="mx-1.5 text-gray-500" />
      {(["mm", "en"] as const).map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => setLanguage(item)}
          className={cn(
            "h-8 min-w-9 rounded-md px-2 text-xs font-semibold transition",
            language === item
              ? "bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-300"
              : "text-gray-500 dark:text-gray-400"
          )}
        >
          {item === "mm" ? "MM" : "EN"}
        </button>
      ))}
    </div>
  );
}
