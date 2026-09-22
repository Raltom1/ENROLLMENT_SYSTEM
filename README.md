# School Enrollment and Grading Management System
## https://raltom1.github.io/ENROLLMENT_SYSTEM/

## What is this system?

This system is used by an **Administrator** to:

- add and edit students
- manage school sections
- transfer students between sections
- enter grades
- update school settings
- view dashboard statistics

**Important:** Only Admin users can log in. There is no public student registration. Students are added by the Admin from the dashboard.

---

# Part 1: Prepare the project files

Make sure these files are in the same folder:

```text
index.html
admin.html
script.js
style.css
Code-1.gs
README.md
```

Do not separate `index.html`, `admin.html`, `script.js`, and `style.css`. They must stay together for the login page and dashboard to work.

---

# Part 2: Create the Google Spreadsheet

## Step 1: Create a spreadsheet

1. Open [Google Sheets](https://sheets.google.com).
2. Select **Blank spreadsheet**.
3. Rename it, for example:

```text
SEMS Database
```

4. Copy the Spreadsheet ID from the URL.

For example, if the URL is:

```text
https://docs.google.com/spreadsheets/d/1ABCxyz123456/edit
```

The Spreadsheet ID is:

```text
1ABCxyz123456
```

Keep this ID. You will use it in Apps Script.

---

# Part 3: Add the backend to Apps Script

## Step 2: Open Apps Script

1. Open the Google Spreadsheet.
2. Click **Extensions**.
3. Select **Apps Script**.
4. A new Apps Script tab will open.
5. On the left side, open the file named `Code.gs`.
6. Delete all of the default code.
7. In VS Code, open `Code-1.gs`.
8. Copy the entire contents of `Code-1.gs`.
9. Paste it into `Code.gs` in Apps Script.

## Step 3: Add the Spreadsheet ID

Find this line in Apps Script:

```javascript
const SPREADSHEET_ID = "PASTE_YOUR_SPREADSHEET_ID_HERE";
```

Replace it with your real Spreadsheet ID.

Example:

```javascript
const SPREADSHEET_ID = "1ABCxyz123456";
```

**Do not paste the full spreadsheet URL. Paste only the ID.**

10. Click **Save**.

---

# Part 4: Automatically create the sheets and headers

## Step 4: Run `setupSpreadsheet`

1. In the Apps Script editor, find the function dropdown at the top.
2. Select:

```text
setupSpreadsheet
```

3. Click **Run**.
4. If Google asks for permission:
   - click **Review permissions**
   - select your Google account
   - click **Advanced** if it appears
   - click **Go to project name**
   - click **Allow**

After the function finishes, it automatically creates these sheets:

```text
Users
Students
Sections
Grades
Settings
ActivityLogs
```

It also adds the required headers to each sheet.

**It does not delete existing data.**

---

# Part 5: Create the Admin account

## Step 5: Run `setupAdminAccount`

1. In the Apps Script function dropdown, select:

```text
setupAdminAccount
```

2. Click **Run**.
3. A dialog will ask for the username.
4. Enter:

```text
admin
```

5. Click **OK**.
6. A second dialog will ask for the password.
7. Enter:

```text
admin@123
```

8. Click **OK**.

The function automatically creates an Admin row in the `Users` sheet:

```text
Username: admin
Role: Admin
Status: Active
```

The password is not stored as plain text. Only the password hash is stored in the `PasswordHash` column.

## If the username already exists

This means an `admin` account already exists. Do not create a duplicate account.

Open the `Users` sheet and check that the account contains:

```text
Role: Admin
Status: Active
```

---

# Part 6: Deploy the backend as a Web App

## Step 6: Create a deployment

1. In the Apps Script editor, click **Deploy**.
2. Select **New deployment**.
3. Under **Select type**, select **Web app**.
4. Under **Execute as**, select:

```text
Me
```

5. Under **Who has access**, select:

```text
Anyone
```

6. Click **Deploy**.
7. Approve the permissions if requested.
8. Copy the **Web app URL**.

The URL usually looks like this:

```text
https://script.google.com/macros/s/ABC123/exec
```

**Copy the complete URL, including `/exec`.**

---

# Part 7: Add the API URL to the frontend

## Step 7: Open `script.js`

In VS Code, open `script.js`.

Find:

```javascript
API_URL: "PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE",
```

Replace it with the Web app URL.

Example:

```javascript
API_URL: "https://script.google.com/macros/s/ABC123/exec",
```

Check the following:

- it starts with `https://`
- it ends with `/exec`
- there are no extra spaces
- there are no extra backticks or quotation marks
- it is the correct deployment URL

Save `script.js`.

---

# Part 8: Open the system

## Step 8: Open the login page

1. In the VS Code Explorer, right-click `index.html`.
2. Select **Open with Live Server** if you have the Live Server extension.
3. If you do not have Live Server, you can double-click `index.html`.

`index.html` is the login page.

Enter:

```text
Username: admin
Password: admin@123
```

After a successful login, the system automatically opens the Admin dashboard in `admin.html`.

## If you are using GitHub Pages

GitHub Pages requires the homepage filename to be exactly:

```text
index.html
```

The filename is case-sensitive. `Index.html` with a capital `I` can cause a 404 error on GitHub Pages.

In your GitHub repository, make sure these files are in the repository root, not inside another folder:

```text
index.html
admin.html
script.js
style.css
```

If your repository currently contains `Index.html`, open that file on GitHub, click the pencil **Edit** button, change the filename to lowercase `index.html`, then click **Commit changes**. Alternatively, rename it in VS Code using **Rename** or `F2` before uploading it again.

Then check GitHub Pages:

1. Open the repository on GitHub.
2. Go to **Settings**.
3. Open **Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the branch containing the files, usually `main`.
6. Select the folder `/ (root)`.
7. Click **Save**.
8. Wait a few minutes, then open the Pages URL again.

The URL should look like this:

```text
https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/
```

Do not add `Index.html` to the URL. GitHub Pages will automatically load the lowercase `index.html` file.

## Project files and their purpose

| File | Purpose |
|---|---|
| `index.html` | Login page only |
| `admin.html` | Protected Admin dashboard |
| `script.js` | Frontend logic and API connection |
| `style.css` | Design and responsive layout |
| `Code-1.gs` | Backend and Google Sheets connection |

---

# Part 9: Use the Admin Dashboard

## Dashboard

The Dashboard shows:

- total students
- total enrolled students
- total sections
- students with grades
- students without grades

## Enrollment

1. Click **Enrollment**.
2. Click **Add Student**.
3. Complete the required fields:
   - Student ID
   - Last Name
   - First Name
   - Gender
   - School Section
4. Click **Save Student**.

Duplicate Student IDs are rejected.

## School Sections

1. Click **School Sections**.
2. To create a section, click **Add Section**.
3. Enter:
   - Grade Level
   - Section Name
4. Click **Create Section**.

To edit a section:

1. Find the section card.
2. Click **Edit**.
3. Change the Grade Level or Section Name.
4. Click **Save Changes**.

To remove a section:

- If the section has no students or grade records, it is permanently deleted.
- If the section has students or historical grades, it is changed to `Inactive` so existing records are not broken.

## Grading

1. Click **Grading**.
2. Select a school section.
3. Enter grades from `0` to `100`.
4. Click **Save Grades**.

The system automatically displays:

- Average
- Passed
- Failed
- Pending
- Invalid

## Settings

1. Click **Settings**.
2. Change the system title, school name, school year, semester, subjects, or passing grade.
3. Click **Save Settings**.
4. Wait for the success message.

If the settings do not save, see the troubleshooting section below.

## Logout

Click **Logout** to return to the login page.

---

# Part 10: What to do after editing `Code-1.gs`

Changes to `Code-1.gs` do not automatically update the live Web App.

Do these steps every time you change the backend:

1. Copy the updated `Code-1.gs` into `Code.gs` in Apps Script.
2. Click **Save**.
3. Click **Deploy**.
4. Select **Manage deployments**.
5. Click the pencil **Edit** icon.
6. Under **Version**, select **New version**.
7. Click **Deploy**.
8. Keep using the same Web app URL.
9. Refresh the browser with `Ctrl + F5`.

If you do not create a new version, the website may continue using the old backend code.

---

# Part 11: Troubleshooting

## Problem: `API_URL is not configured yet`

Fix it as follows:

1. Open `script.js`.
2. Find `API_URL`.
3. Replace the placeholder with the real Web app URL.
4. Save the file.
5. Refresh the page with `Ctrl + F5`.

## Problem: `Session expired`

This means the login token has expired.

Do this:

1. Return to `index.html`.
2. Log in again.
3. If it happens repeatedly, create a new Apps Script deployment version.

## Problem: `Offline (cached)`

Possible causes:

- the API URL is incorrect
- the deployment is outdated
- Web App access is not set to `Anyone`
- `setupSpreadsheet` was not run
- the session has expired
- there is an internet connection problem

## Problem: Settings do not save

Check the following:

1. You are logged in as an Admin.
2. The `Role` in the `Users` sheet is `Admin`.
3. The `Status` is `Active`.
4. The API URL is correct.
5. The latest `Code.gs` was redeployed.
6. Refresh the page with `Ctrl + F5`.

## Problem: `Unknown action: removeSection`

The Apps Script deployment is outdated.

Do this:

1. Paste the latest `Code-1.gs` into Apps Script.
2. Click **Save**.
3. Go to **Deploy → Manage deployments**.
4. Edit the deployment.
5. Select **New version**.
6. Deploy again.

## Problem: Login does not work

Check the `Users` sheet:

```text
Username: admin
Role: Admin
Status: Active
```

Make sure the password was created using `setupAdminAccount()` and that the username is spelled correctly.

---

# Part 12: Basic testing checklist

Use this checklist after setup:

- [ ] `index.html` opens as the login page.
- [ ] Admin login works.
- [ ] The system opens `admin.html` after login.
- [ ] The dashboard cannot be opened without login.
- [ ] The Dashboard loads.
- [ ] A student can be added.
- [ ] Duplicate Student IDs are rejected.
- [ ] A section can be added.
- [ ] A section can be edited.
- [ ] An empty section can be removed.
- [ ] A section with students or grades is archived.
- [ ] Grades can be entered.
- [ ] Grades below 0 or above 100 are rejected.
- [ ] Settings can be saved.
- [ ] Logout works.
- [ ] Non-Admin users cannot log in.

---

# Important security reminder

Do not put the Admin password in `Code-1.gs` or in the frontend files.

The correct process is:

1. Run `setupAdminAccount()`.
2. Enter the credentials in the dialogs.
3. Log in through `index.html`.

The backend checks the Admin role. Even if a user can see the frontend files, they cannot access protected data without a valid Admin session.
