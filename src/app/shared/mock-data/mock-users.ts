/**
 * Mock Users Data for Local Development
 * Use these credentials to test different user roles without Supabase
 */

import type { UserProfile } from '../models';

export interface MockUser {
  id: string;
  username: string;
  password: string;
  profile: UserProfile;
}

/**
 * Test users with different roles
 * All passwords are: "password123"
 */
export const MOCK_USERS: MockUser[] = [
  // Super Admin
  {
    id: 'mock-super-admin-001',
    username: 'superadmin',
    password: 'password123',
    profile: {
      id: 'mock-super-admin-001',
      username: 'superadmin',
      display_name: 'Super Administrator',
      role: 'super_admin',
      alliance_id: null,
      invitation_token_id: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }
  },
  
  // Admin of Alliance 1 (Phoenix Guild)
  {
    id: 'mock-admin-001',
    username: 'admin1',
    password: 'password123',
    profile: {
      id: 'mock-admin-001',
      username: 'admin1',
      display_name: 'Phoenix Admin',
      role: 'admin',
      alliance_id: 'mock-alliance-001',
      invitation_token_id: null,
      created_at: '2024-01-10T00:00:00Z',
      updated_at: '2024-01-10T00:00:00Z',
    }
  },
  
  // Admin of Alliance 2 (Dragon Slayers)
  {
    id: 'mock-admin-002',
    username: 'admin2',
    password: 'password123',
    profile: {
      id: 'mock-admin-002',
      username: 'admin2',
      display_name: 'Dragon Admin',
      role: 'admin',
      alliance_id: 'mock-alliance-002',
      invitation_token_id: null,
      created_at: '2024-01-15T00:00:00Z',
      updated_at: '2024-01-15T00:00:00Z',
    }
  },
  
  // Members of Alliance 1 (Phoenix Guild)
  {
    id: 'mock-member-001',
    username: 'alice',
    password: 'password123',
    profile: {
      id: 'mock-member-001',
      username: 'alice',
      display_name: 'Alice Johnson',
      role: 'member',
      alliance_id: 'mock-alliance-001',
      invitation_token_id: null,
      created_at: '2024-01-20T00:00:00Z',
      updated_at: '2024-01-20T00:00:00Z',
    }
  },
  {
    id: 'mock-member-002',
    username: 'bob',
    password: 'password123',
    profile: {
      id: 'mock-member-002',
      username: 'bob',
      display_name: 'Bob Smith',
      role: 'member',
      alliance_id: 'mock-alliance-001',
      invitation_token_id: null,
      created_at: '2024-01-21T00:00:00Z',
      updated_at: '2024-01-21T00:00:00Z',
    }
  },
  {
    id: 'mock-member-003',
    username: 'charlie',
    password: 'password123',
    profile: {
      id: 'mock-member-003',
      username: 'charlie',
      display_name: 'Charlie Brown',
      role: 'member',
      alliance_id: 'mock-alliance-001',
      invitation_token_id: null,
      created_at: '2024-01-22T00:00:00Z',
      updated_at: '2024-01-22T00:00:00Z',
    }
  },
  
  // Members of Alliance 2 (Dragon Slayers)
  {
    id: 'mock-member-004',
    username: 'diana',
    password: 'password123',
    profile: {
      id: 'mock-member-004',
      username: 'diana',
      display_name: 'Diana Prince',
      role: 'member',
      alliance_id: 'mock-alliance-002',
      invitation_token_id: null,
      created_at: '2024-01-25T00:00:00Z',
      updated_at: '2024-01-25T00:00:00Z',
    }
  },
  {
    id: 'mock-member-005',
    username: 'ethan',
    password: 'password123',
    profile: {
      id: 'mock-member-005',
      username: 'ethan',
      display_name: 'Ethan Hunt',
      role: 'member',
      alliance_id: 'mock-alliance-002',
      invitation_token_id: null,
      created_at: '2024-01-26T00:00:00Z',
      updated_at: '2024-01-26T00:00:00Z',
    }
  },
];

/**
 * Mock Alliances
 */
export const MOCK_ALLIANCES = [
  {
    id: 'mock-alliance-001',
    name: 'Phoenix Guild',
    owner_id: 'mock-admin-001',
    created_at: '2024-01-10T00:00:00Z',
    updated_at: '2024-01-10T00:00:00Z',
  },
  {
    id: 'mock-alliance-002',
    name: 'Dragon Slayers',
    owner_id: 'mock-admin-002',
    created_at: '2024-01-15T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
  },
];

/**
 * Find mock user by username
 */
export function findMockUser(username: string): MockUser | undefined {
  return MOCK_USERS.find(u => u.username.toLowerCase() === username.toLowerCase());
}

/**
 * Validate mock user credentials
 */
export function validateMockCredentials(username: string, password: string): MockUser | null {
  const user = findMockUser(username);
  if (user && user.password === password) {
    return user;
  }
  return null;
}

/**
 * Get all users for a specific alliance
 */
export function getMockUsersByAlliance(allianceId: string): MockUser[] {
  return MOCK_USERS.filter(u => u.profile.alliance_id === allianceId);
}
