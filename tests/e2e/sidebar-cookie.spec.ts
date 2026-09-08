import { test, expect } from '@playwright/test';
import {
  SIDEBAR_COOKIE_NAME,
  SIDEBAR_COOKIE_MAX_AGE,
  readSidebarStateCookie,
  sidebarStateCookie,
} from '../../components/sidebar/sidebar-cookie';

test.describe('sidebar cookie contract', () => {
  test('constants match the legacy shadcn provider', () => {
    expect(SIDEBAR_COOKIE_NAME).toBe('sidebar_state');
    expect(SIDEBAR_COOKIE_MAX_AGE).toBe(604800);
  });

  test('defaults to open when the cookie is absent', () => {
    expect(readSidebarStateCookie('')).toBe(true);
    expect(readSidebarStateCookie('other=1; another=2')).toBe(true);
  });

  test('reads both persisted values', () => {
    expect(readSidebarStateCookie('sidebar_state=false')).toBe(false);
    expect(readSidebarStateCookie('sidebar_state=true')).toBe(true);
  });

  test('reads the cookie when others surround it', () => {
    expect(readSidebarStateCookie('a=1; sidebar_state=false; b=2')).toBe(false);
  });

  test('ignores a cookie whose name merely ends in sidebar_state', () => {
    expect(readSidebarStateCookie('x_sidebar_state=false')).toBe(true);
  });

  test('serializes exactly what layout.tsx parses back', () => {
    expect(sidebarStateCookie(false)).toBe('sidebar_state=false; path=/; max-age=604800');
    expect(sidebarStateCookie(true)).toBe('sidebar_state=true; path=/; max-age=604800');
  });

  test('round-trips through the layout regex', () => {
    for (const open of [true, false]) {
      expect(readSidebarStateCookie(sidebarStateCookie(open))).toBe(open);
    }
  });
});
