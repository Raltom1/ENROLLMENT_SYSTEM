# School Enrollment and Grading Management System

## Para saan ang system na ito?

Ang system na ito ay ginagamit ng **Admin** para sa:

- pagdagdag at pag-edit ng student
- pag-aayos ng school sections
- paglipat ng student sa ibang section
- paglalagay ng grades
- pag-save ng school settings
- pagtingin ng dashboard

**Mahalaga:** Admin lamang ang puwedeng mag-login. Walang public registration para sa students. Ang student ay idinadagdag ng Admin mula sa dashboard.

---

# PART 1: Ihanda ang mga files

Siguraduhing magkakasama sa iisang folder ang mga file na ito:

```text
Index.html
admin.html
script.js
style.css
Code-1.gs
README.md
```

Huwag paghiwa-hiwalayin ang `Index.html`, `admin.html`, `script.js`, at `style.css`. Kailangan magkakasama ang mga ito para gumana ang login at dashboard.

---

# PART 2: Gumawa ng Google Spreadsheet

## Step 1: Gumawa ng spreadsheet

1. Buksan ang [Google Sheets](https://sheets.google.com).
2. Piliin ang **Blank spreadsheet**.
3. Palitan ang pangalan, halimbawa:

```text
SEMS Database
```

4. Kopyahin ang Spreadsheet ID mula sa URL.

Halimbawa ang URL ay:

```text
https://docs.google.com/spreadsheets/d/1ABCxyz123456/edit
```

Ang Spreadsheet ID ay:

```text
1ABCxyz123456
```

Itago muna ang ID dahil gagamitin ito sa Apps Script.

---

# PART 3: Ilagay ang backend sa Apps Script

## Step 2: Buksan ang Apps Script

1. Sa loob ng Google Spreadsheet, i-click ang **Extensions**.
2. Piliin ang **Apps Script**.
3. May bubukas na bagong tab na Apps Script.
4. Sa kaliwang bahagi, buksan ang file na `Code.gs`.
5. Burahin ang lahat ng default code.
6. Sa VS Code, buksan ang file na `Code-1.gs`.
7. Kopyahin ang buong laman ng `Code-1.gs`.
8. I-paste ito sa `Code.gs` sa Apps Script.

## Step 3: Ilagay ang Spreadsheet ID

Hanapin ang linyang ito sa Apps Script:

```javascript
const SPREADSHEET_ID = "PASTE_YOUR_SPREADSHEET_ID_HERE";
```

Palitan ito ng tunay na Spreadsheet ID.

Halimbawa:

```javascript
const SPREADSHEET_ID = "1ABCxyz123456";
```

**Huwag ilagay ang buong URL. ID lamang ang ilagay.**

8. I-click ang **Save**.

---

# PART 4: Automatic na gumawa ng sheets at headers

## Step 4: Run ang setupSpreadsheet

1. Sa Apps Script editor, hanapin ang function dropdown sa taas.
2. Piliin ang:

```text
setupSpreadsheet
```

3. I-click ang **Run**.
4. Kapag may permission prompt:
   - i-click ang **Review permissions**
   - piliin ang Google account mo
   - i-click ang **Advanced** kung lumabas
   - i-click ang **Go to project name**
   - i-click ang **Allow**

Pagkatapos tumakbo, automatic na gagawa ang function ng mga sheet na ito:

```text
Users
Students
Sections
Grades
Settings
ActivityLogs
```

Automatic din nitong ilalagay ang headers sa bawat sheet.

**Hindi nito buburahin ang existing data.**

---

# PART 5: Gumawa ng Admin account

## Step 5: Run ang setupAdminAccount

1. Sa Apps Script function dropdown, piliin:

```text
setupAdminAccount
```

2. I-click ang **Run**.
3. May lalabas na dialog para sa username.
4. Ilagay:

```text
admin
```

5. I-click ang **OK**.
6. May lalabas na dialog para sa password.
7. Ilagay:

```text
admin@123
```

8. I-click ang **OK**.

Automatic na gagawa ito ng Admin row sa `Users` sheet:

```text
Username: admin
Role: Admin
Status: Active
```

Ang password ay hindi ise-save bilang plain text. Password hash lamang ang ilalagay sa `PasswordHash` column.

## Kapag sinabi na existing na ang username

Ibig sabihin mayroon nang `admin` account. Huwag ulit gumawa ng duplicate account.

Puwede mong tingnan ang `Users` sheet at siguraduhing ganito ang values:

```text
Role: Admin
Status: Active
```

---

# PART 6: I-deploy ang backend bilang Web App

## Step 6: Gumawa ng deployment

1. Sa Apps Script editor, i-click ang **Deploy**.
2. Piliin ang **New deployment**.
3. Sa **Select type**, piliin ang **Web app**.
4. Sa **Execute as**, piliin:

```text
Me
```

5. Sa **Who has access**, piliin:

```text
Anyone
```

6. I-click ang **Deploy**.
7. I-approve ang permissions kung hihingin.
8. Kopyahin ang **Web app URL**.

Ang URL ay karaniwang ganito ang format:

```text
https://script.google.com/macros/s/ABC123/exec
```

**Kopyahin ang buong URL hanggang `/exec`.**

---

# PART 7: Ilagay ang API URL sa frontend

## Step 7: Buksan ang script.js

Sa VS Code, buksan ang `script.js`.

Hanapin ang:

```javascript
API_URL: "PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE",
```

Palitan ito ng Web app URL.

Halimbawa:

```javascript
API_URL: "https://script.google.com/macros/s/ABC123/exec",
```

Siguraduhin ang mga sumusunod:

- may `https://`
- nagtatapos sa `/exec`
- walang extra space
- walang backtick o extra quotation mark
- tama ang deployment URL

I-save ang `script.js`.

---

# PART 8: I-open ang system

## Step 8: Buksan ang login page

1. Sa VS Code Explorer, i-right-click ang `Index.html`.
2. Piliin ang **Open with Live Server** kung mayroon kang Live Server extension.
3. Kung wala, puwedeng i-double-click ang `Index.html`.

Ang `Index.html` ang login page.

Ilagay:

```text
Username: admin
Password: admin@123
```

Pag tama ang credentials, automatic kang mapupunta sa `admin.html` dashboard.

## Mga file at gamit nila

| File | Gamit |
|---|---|
| `Index.html` | Login page lamang |
| `admin.html` | Protected Admin dashboard |
| `script.js` | Frontend logic at API connection |
| `style.css` | Design at responsive layout |
| `Code-1.gs` | Backend at Google Sheets connection |

---

# PART 9: Paano gamitin ang Admin Dashboard

## Dashboard

Makikita rito ang:

- total students
- total enrolled students
- total sections
- students na may grades
- students na walang grades

## Enrollment

1. I-click ang **Enrollment**.
2. I-click ang **Add Student**.
3. Punan ang required fields:
   - Student ID
   - Last Name
   - First Name
   - Gender
   - School Section
4. I-click ang **Save Student**.

Ang duplicate Student ID ay hindi tatanggapin.

## School Sections

1. I-click ang **School Sections**.
2. Para gumawa ng section, i-click ang **Add Section**.
3. Ilagay ang:
   - Grade Level
   - Section Name
4. I-click ang **Create Section**.

Para mag-edit:

1. Hanapin ang section card.
2. I-click ang **Edit**.
3. Baguhin ang Grade Level o Section Name.
4. I-click ang **Save Changes**.

Para mag-remove:

- Kung walang student at grade record ang section, mabubura ito.
- Kung may student o historical grade, magiging `Inactive` ito para hindi masira ang records.

## Grading

1. I-click ang **Grading**.
2. Pumili ng school section.
3. Ilagay ang grades mula `0` hanggang `100`.
4. I-click ang **Save Grades**.

Automatic na makikita ang:

- Average
- Passed
- Failed
- Pending
- Invalid

## Settings

1. I-click ang **Settings**.
2. Baguhin ang system title, school name, school year, semester, subjects, o passing grade.
3. I-click ang **Save Settings**.
4. Hintayin ang success message.

Kung hindi nag-save, tingnan ang troubleshooting section sa ibaba.

## Logout

I-click ang **Logout** para bumalik sa login page.

---

# PART 10: Kapag nag-edit ng Code.gs

Kapag may binago ka sa `Code-1.gs`, hindi agad mababago ang live Web App.

Gawin ito bawat may backend update:

1. Kopyahin ulit ang updated `Code-1.gs` sa Apps Script `Code.gs`.
2. I-click ang **Save**.
3. I-click ang **Deploy**.
4. Piliin ang **Manage deployments**.
5. I-click ang **Edit** pencil icon.
6. Sa **Version**, piliin ang **New version**.
7. I-click ang **Deploy**.
8. Panatilihin ang parehong Web app URL.
9. I-refresh ang browser gamit ang `Ctrl + F5`.

Kung hindi gumawa ng bagong version, maaaring luma pa rin ang ginagamit ng website.

---

# PART 11: Troubleshooting

## Problema: `API_URL is not configured yet`

Ayusin ito:

1. Buksan ang `script.js`.
2. Tingnan ang `API_URL`.
3. Palitan ang placeholder ng tunay na Web app URL.
4. I-save.
5. I-refresh gamit ang `Ctrl + F5`.

## Problema: `Session expired`

Ibig sabihin expired na ang login token.

Gawin ito:

1. Bumalik sa `Index.html`.
2. Mag-login ulit.
3. Kung paulit-ulit, gumawa ng bagong Apps Script deployment version.

## Problema: `Offline (cached)`

Posibleng dahilan:

- mali ang API URL
- luma ang deployment
- hindi naka-`Anyone` ang Web App access
- hindi naka-run ang `setupSpreadsheet`
- expired ang session
- may internet problem

## Problema: Hindi nagse-save ang Settings

Suriin ang mga ito:

1. Naka-login bilang Admin.
2. `Role` sa `Users` sheet ay `Admin`.
3. `Status` ay `Active`.
4. Tama ang API URL.
5. Na-redeploy ang latest `Code.gs`.
6. I-refresh ang page gamit ang `Ctrl + F5`.

## Problema: `Unknown action: removeSection`

Luma pa ang Apps Script deployment.

Gawin:

1. I-paste ang latest `Code-1.gs`.
2. Save.
3. Deploy → Manage deployments.
4. Edit deployment.
5. Piliin ang **New version**.
6. Deploy ulit.

## Problema: Hindi gumagana ang login

Suriin ang `Users` sheet:

```text
Username: admin
Role: Admin
Status: Active
```

Siguraduhing ang password ay ginawa gamit ang `setupAdminAccount()` at tama ang spelling ng username.

---

# PART 12: Basic testing checklist

Gamitin ito pagkatapos ng setup:

- [ ] Nagbubukas ang `Index.html` bilang login page.
- [ ] Gumagana ang Admin login.
- [ ] Napupunta sa `admin.html` pagkatapos mag-login.
- [ ] Hindi nabubuksan ang dashboard kapag walang login.
- [ ] Lumalabas ang Dashboard.
- [ ] Nakakapagdagdag ng student.
- [ ] Nare-reject ang duplicate Student ID.
- [ ] Nakakapagdagdag ng section.
- [ ] Nakakapag-edit ng section.
- [ ] Nakaka-remove ng empty section.
- [ ] Na-a-archive ang section na may student o grades.
- [ ] Nakakapaglagay ng grades.
- [ ] Nare-reject ang grade na mas mababa sa 0 o higit sa 100.
- [ ] Nakakapag-save ng Settings.
- [ ] Gumagana ang Logout.
- [ ] Hindi nakakapasok ang non-Admin account.

---

# Important security reminder

Huwag ilagay ang Admin password sa `Code-1.gs` o sa frontend files.

Ang tamang proseso ay:

1. Run `setupAdminAccount()`.
2. Ilagay ang credentials sa dialog.
3. Mag-login sa `Index.html`.

Ang backend ang nagche-check ng Admin role. Kahit makita ng user ang frontend files, hindi siya makakakuha ng protected data nang walang valid Admin session.
