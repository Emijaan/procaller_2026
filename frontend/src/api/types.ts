export type Presence = 'offline' | 'available' | 'paused' | 'on_call' | 'wrap_up';
export type CallState = 'idle' | 'initiating' | 'ringing' | 'connected' | 'on_hold' | 'ended';

export interface Organization {
  id: number;
  name: string;
  product_name: string;
  timezone: string;
}

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  display_name: string;
  role: 'admin' | 'supervisor' | 'agent';
  team: string;
  extension: string;
  presence: Presence;
  avatar_initials: string;
  organization: Organization | null;
}

export interface Campaign {
  id: number;
  name: string;
  status: string;
  dial_method: string;
  caller_id: string;
  caller_id_name: string;
  active: boolean;
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
  media_mode: string;
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
