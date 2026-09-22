export type Presence = 'offline' | 'available' | 'paused' | 'on_call' | 'wrap_up';
export type CallState = 'idle' | 'initiating' | 'ringing' | 'connected' | 'on_hold' | 'ended';

export interface Organization {
  id: number;
  name: string;
  product_name: string;
  timezone: string;
  is_active?: boolean;
  subscription_status?: string;
  max_managers?: number;
  max_admins?: number;
  max_users?: number;
  managers?: number;
  admins?: number;
  users?: number;
  managers_used?: number;
  admins_used?: number;
  users_used?: number;
}

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  display_name: string;
  role: 'super_admin' | 'agency' | 'manager' | 'admin' | 'user' | 'supervisor' | 'agent' | string;
  role_normalized?: string;
  team: string;
  extension: string;
  presence: Presence;
  avatar_initials: string;
  organization: Organization | null;
  reports_to?: number | null;
  reports_to_name?: string;
  permissions?: string[];
  max_admins?: number;
  max_users?: number;
  is_active?: boolean;
}

export interface Campaign {
  id: number;
  name: string;
  description?: string;
  status: string;
  dial_method: string;
  caller_id: string;
  caller_id_name: string;
  active: boolean;
  agency_name?: string;
  manager_name?: string;
  admin_name?: string;
  lead_count?: number;
  assigned_users?: number[];
  assigned_count?: number;
  has_hold_audio?: boolean;
  hold_audio_name?: string;
  wrap_up_seconds?: number;
  dial_ratio?: number;
  code?: string;
}

export interface Contact {
  id: number;
  name: string;
  phone: string;
  email: string;
  company: string;
  status: string;
  owner: number | null;
  owner_name: string;
  campaign: number | null;
  campaign_name: string;
  tags: string[];
  lead_score: number;
  comments: string;
  last_disposition: string;
  last_contact_at: string | null;
  lead_status?: string;
  extra_data?: Record<string, string>;
  next_callback_at?: string | null;
  call_count?: number;
}

export interface CallRecord {
  id: number;
  phone_number: string;
  customer: string;
  agent_name: string;
  campaign: number | null;
  campaign_name: string;
  contact: number | null;
  contact_name: string;
  contact_company: string;
  contact_email: string;
  contact_tags: string[];
  contact_score: number;
  contact_status: string;
  contact_comments: string;
  contact_extra_data?: Record<string, string>;
  contact_lead_status?: string;
  last_disposition: string;
  initials: string;
  direction: string;
  state: CallState | string;
  status: string;
  outcome: string;
  disposition: string;
  notes: string;
  muted: boolean;
  on_hold: boolean;
  recording: boolean;
  has_recording?: boolean;
  recording_bytes?: number;
  agency_id?: number | null;
  agency_name?: string;
  user_name?: string;
  hangup_cause?: string;
  hold_seconds?: number;
  wrap_up_seconds?: number;
  dial_batch?: string;
  duration: string;
  duration_seconds: number;
  date: string;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
}

export interface TelephonySession {
  session: { id: number; room_id: string; status: string };
  mode: 'sandbox' | 'asterisk';
  backend: string;
  room_id: string;
  extension: string;
  ice_servers: RTCIceServer[];
  sip: {
    uri: string;
    password: string;
    ws_url: string;
    display_name: string;
    conference: string;
  } | null;
}
