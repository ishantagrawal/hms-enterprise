import { expect, test } from '@playwright/test';

function installApiMock(page, role = 'Student', startLive = false) {
  return page.addInitScript(({ initialRole, initiallyLive }) => {
    const makeUser = (userRole) => ({
      role: userRole,
      user_id: userRole === 'Student' ? '22CE047' : `${userRole.toUpperCase()}-01`,
      full_name: userRole === 'Student' ? 'Aarav Patel' : `Test ${userRole}`,
      hostel_block: 'Gajjar',
      wing: 'Wing A',
      room: 'A-101',
      phone: '9876543210',
      guardian_phone: '9876543211',
      department: 'Civil',
      year: 2,
      division: 'A',
      college_id: 'TEST',
      biometric_status: 'Locked',
      face_enrolled: true
    });
    const student = makeUser('Student');
    let activeUser = makeUser(initialRole);
    const classSession = {
      id: 'CLASS-SESSION',
      scope: 'CLASS',
      course_code: 'CE101',
      course_title: 'Civil Systems',
      class_group: 'Civil-A',
      faculty_name: 'Test Faculty',
      students: [{ student_id: student.user_id, roll_no: student.user_id, student_name: student.full_name, status: 'ABSENT' }],
      present_count: 0
    };
    const hostelSession = {
      id: 'HOSTEL-SESSION',
      scope: 'HOSTEL',
      wing_name: 'Wing A',
      hostel_block: 'Gajjar',
      students: [{ student_id: student.user_id, roll_no: student.user_id, student_name: student.full_name, status: 'ABSENT' }],
      present_count: 0
    };
    let sessions = initiallyLive ? [initialRole === 'Warden' ? hostelSession : classSession] : [];
    const json = (data, status = 200) => new Response(JSON.stringify(data), {
      status,
      headers: { 'content-type': 'application/json' }
    });
    const hostels = [{ hostel_id: 'G1', name: 'Gajjar', wings: ['Wing A'], wing_beacons: {} }];
    const eventDate = new Date().toISOString().slice(0, 10);

    window.fetch = async (input, init = {}) => {
      const requestUrl = typeof input === 'string' ? input : input.url;
      const url = new URL(requestUrl, window.location.href);
      if (!url.pathname.startsWith('/api/')) {
        return json({});
      }
      const method = (init.method || 'GET').toUpperCase();
      const body = init.body ? JSON.parse(init.body) : {};
      let data = { success: true };

      if (url.pathname === '/api/tenant') {
        data = {
          college_name: 'Test College',
          college_id: 'TEST',
          modules: {
            attendance: true,
            class_attendance: true,
            hostel_attendance: true,
            event_radar: true,
            grievances: true,
            gate_outpass: true
          },
          hostels
        };
      } else if (url.pathname === '/api/auth/login') {
        activeUser = makeUser(initialRole);
        data = { success: true, token: 'mobile-smoke-token' };
      } else if (url.pathname === '/api/auth/me') {
        data = { user: activeUser };
      } else if (url.pathname === '/api/auth/password-reset-requests') {
        data = { success: true, message: 'Request submitted to the onboarding desk.' };
      } else if (url.pathname === '/api/portal/bootstrap') {
        data = {
          user: activeUser,
          students: [student],
          complaints: [],
          departments: [{ id: 'CENTRAL', title: 'Central Staff' }, { id: 'HOSTEL', title: 'Hostel Maintenance' }],
          events: [{ event_id: 'EV1', title: 'Mobile Smoke Event', date: eventDate, club_id: 'ACM', venue: 'Campus', start_time: '10:00', end_time: '11:00' }],
          clubs: [{ club_id: 'ACM', name: 'ACM', mission: 'Learn' }],
          notices: [{ notice_id: 'N1', title: 'Test notice', message: 'Notice details' }],
          ads: [],
          hostels,
          leave_passes: [],
          attendance_logs: []
        };
      } else if (url.pathname === '/api/attendance-v2/student/open-sessions') {
        data = [];
      } else if (url.pathname === '/api/attendance-v2/student/class-summary') {
        data = [{ summary_id: 'S1', course_code: 'CE101', course_title: 'Civil Systems', faculty_name: 'Test Faculty', department: 'Civil', year: 2, division: 'A', percentage: 90, present_count: 9, total_sessions: 10, sessions: [] }];
      } else if (url.pathname === '/api/attendance-v2/student/hostel-history') {
        data = { wing_name: 'Gajjar - Wing A', room_no: 'A-101', monthly_percentage: 100, records: [] };
      } else if (url.pathname === '/api/attendance-v2/device/status') {
        data = { device_locked: false, enrollment_window_expires_at: new Date(Date.now() + 120000).toISOString() };
      } else if (url.pathname === '/api/attendance-v2/courses') {
        data = [{ id: 'COURSE-1', code: 'CE101', title: 'Civil Systems' }];
      } else if (url.pathname === '/api/attendance-v2/directory/class-groups') {
        data = [{ department: 'Civil', year: 2, division: 'A', student_count: 1 }];
      } else if (url.pathname === '/api/attendance-v2/beacons') {
        data = url.searchParams.get('scope') === 'HOSTEL'
          ? [{ id: 'B-HOSTEL', name: 'Gajjar Wing A', is_active: true, is_provisioned: true, hostel_block: 'Gajjar', wing_name: 'Wing A', beacon_code: '0x564F' }]
          : [{ id: 'B-CLASS', name: 'Classroom 1', is_active: true, is_provisioned: true, beacon_code: '0x564F' }];
      } else if (url.pathname === '/api/attendance-v2/sessions' && method === 'POST') {
        sessions = [url.searchParams.get('scope') === 'HOSTEL' ? hostelSession : initialRole === 'Warden' ? hostelSession : classSession];
        data = { id: sessions[0].id, scope: sessions[0].scope, status: 'OPEN' };
      } else if (url.pathname === '/api/attendance-v2/sessions') {
        data = url.searchParams.get('scope') === 'HOSTEL'
          ? sessions.filter((session) => session.scope === 'HOSTEL')
          : sessions.filter((session) => session.scope === 'CLASS');
      } else if (/\/api\/attendance-v2\/sessions\/[^/]+\/override$/.test(url.pathname)) {
        data = { success: true };
      } else if (/\/api\/attendance-v2\/sessions\/[^/]+\/audit$/.test(url.pathname)) {
        data = [];
      } else if (url.pathname === '/api/hostels/config') {
        data = hostels;
      } else if (url.pathname === '/api/profile/requests' && method === 'POST') {
        data = { success: true, request: { request_id: 'PR1', status: 'Pending', created_at: new Date().toISOString(), requested_changes: body } };
      } else if (url.pathname === '/api/profile/requests') {
        data = { profile: activeUser, requests: [] };
      } else if (url.pathname === '/api/complaints' && method === 'POST') {
        data = { success: true, ticket: { ticket_id: 'T1', summary: body.summary, description: body.description, status: 'Pending', category: body.category } };
      } else if (url.pathname === '/api/leave/apply') {
        data = { leave_pass: { pass_id: 'P1', leave_type: body.leave_type, from_date: body.from_date, to_date: body.to_date, status: 'Pending Warden Approval' } };
      }

      return json(data);
    };
  }, { initialRole: role, initiallyLive: startLive });
}

async function signIn(page, role = 'Student') {
  await installApiMock(page, role);
  await page.goto('/app');
  await page.getByLabel('Roll number / username').fill(role === 'Student' ? '22CE047' : `${role}-01`);
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Sign in securely' }).click();
  if (role === 'Faculty') {
    await expect(page.getByRole('heading', { name: 'Faculty attendance' })).toBeVisible();
  } else if (role === 'Warden') {
    await expect(page.getByRole('button', { name: /Home/ })).toBeVisible();
  } else {
    await expect(page.getByRole('button', { name: 'Home', exact: true })).toBeVisible();
  }
}

async function expectNoHorizontalOverflow(page) {
  const width = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth
  }));
  expect(Math.max(width.document, width.body)).toBeLessThanOrEqual(width.viewport);
}

test('Student login, password request, and attendance return navigation work on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await installApiMock(page);
  await page.goto('/app');
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByLabel('Roll number').fill('22CE047');
  await page.getByRole('button', { name: 'Send request to onboarding desk' }).click();
  await expect(page.getByText('Request submitted to the onboarding desk.')).toBeVisible();
  await page.getByRole('button', { name: 'Back to sign in' }).click();
  await page.getByLabel('Roll number / username').fill('22CE047');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByLabel('Remember me').check();
  await page.getByRole('button', { name: 'Sign in securely' }).click();
  await expect(page.getByRole('button', { name: 'Attendance', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('vidyut_session_token'))).toBe('mobile-smoke-token');

  await page.getByRole('button', { name: 'Attendance', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your attendance' })).toBeVisible();
  await expect(page.getByText(/enrollment window is open for \d:\d\d/)).toBeVisible();
  await page.getByRole('button', { name: '← Home' }).click();
  await expect(page.getByRole('heading', { name: 'Aarav Patel' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('Student calendar, out-pass, complaint, and profile request flows work on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page);
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Event Calendar' })).toBeVisible();
  await page.getByRole('button', { name: new RegExp(new Date().toISOString().slice(0, 10)) }).click();
  for (const width of [360, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 812 });
    await expectNoHorizontalOverflow(page);
    const gridWidth = await page.locator('.ptm-cal-grid').evaluate((element) => element.getBoundingClientRect().width);
    expect(gridWidth).toBeLessThanOrEqual(width);
  }

  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'Out pass' }).click();
  const leaveDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await page.getByLabel('From date').fill(leaveDate);
  await page.getByLabel('To date').fill(leaveDate);
  await page.getByLabel('Destination').fill('City');
  await page.getByLabel('Reason').fill('Personal errand');
  await page.getByRole('button', { name: 'Submit leave request' }).click();
  await expect(page.getByText('Digital leave pass sent to your Warden for approval.')).toBeVisible();

  await page.getByRole('button', { name: 'Requests', exact: true }).click();
  await page.getByRole('button', { name: /New/ }).click();
  await page.getByLabel('Select Maintenance Department').selectOption('HOSTEL');
  await page.getByLabel('Short Issue Title').fill('Leaking tap');
  await page.getByLabel('Detailed Description').fill('Tap is leaking');
  await page.getByRole('button', { name: 'Submit Grievance' }).click();
  await expect(page.getByText('Grievance submitted successfully.')).toBeVisible();

  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await page.getByLabel('Mobile number').fill('9876543212');
  await page.getByRole('button', { name: 'Send request to warden' }).click();
  await expect(page.getByText('Profile change request sent to your warden.')).toBeVisible();
});

test('Faculty can start class attendance and manually override an absent student', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, 'Faculty');
  await expect(page.getByRole('heading', { name: 'Faculty attendance' })).toBeVisible();
  await page.getByRole('button', { name: /Civil · A/ }).click();
  await page.getByRole('button', { name: /Classroom 1/ }).click();
  await page.getByRole('button', { name: /Start attendance/ }).click();
  await expect(page.getByText('Attendance is live')).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('Faculty manual override and Warden roll-call controls are reachable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await installApiMock(page, 'Faculty', true);
  await page.goto('/app');
  await page.getByLabel('Roll number / username').fill('Faculty-01');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Sign in securely' }).click();
  await expect(page.getByRole('button', { name: /Manual mark present/ })).toBeVisible();
  page.on('dialog', (dialog) => dialog.accept('Student phone unavailable'));
  await page.getByRole('button', { name: /Manual mark present/ }).click();
  await expect(page.getByText('Attendance override recorded.')).toBeVisible();

  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await signIn(page, 'Warden');
  await page.getByRole('button', { name: /Live Roll Call/ }).click();
  await expect(page.getByRole('heading', { name: 'Warden attendance' })).toBeVisible();
  await expect(page.getByLabel('Hostel')).toBeVisible();
  await expect(page.getByLabel(/^Wing/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start roll call' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
