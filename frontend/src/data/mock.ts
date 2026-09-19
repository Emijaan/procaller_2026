export const agents = [
  { id: 'a1', name: 'Rahul Sharma', avatar: 'RS', role: 'Agent', team: 'Sales Alpha', status: 'on_call', campaign: 'Delhi Real Estate', currentLead: 'Rajesh Kumar', callDuration: '02:34', callsToday: 28, talkTime: '4h 12m', conversion: 7 },
  { id: 'a2', name: 'Priya Singh', avatar: 'PS', role: 'Senior Agent', team: 'Sales Alpha', status: 'available', campaign: 'Mumbai Finance', currentLead: null, callsToday: 22, talkTime: '3h 44m', conversion: 5 },
  { id: 'a3', name: 'Amit Verma', avatar: 'AV', role: 'Agent', team: 'Sales Beta', status: 'wrap_up', campaign: 'Pune Insurance', currentLead: 'Neha Kapoor', callDuration: '00:45', callsToday: 19, talkTime: '3h 02m', conversion: 4 },
  { id: 'a4', name: 'Neha Kapoor', avatar: 'NK', role: 'Agent', team: 'Sales Beta', status: 'break', campaign: '', currentLead: null, callsToday: 15, talkTime: '2h 18m', conversion: 3 },
  { id: 'a5', name: 'Suresh Patel', avatar: 'SP', role: 'Agent', team: 'Sales Gamma', status: 'offline', campaign: '', currentLead: null, callsToday: 0, talkTime: '0m', conversion: 0 },
  { id: 'a6', name: 'Anjali Mehta', avatar: 'AM', role: 'Senior Agent', team: 'Sales Gamma', status: 'on_call', campaign: 'Hyderabad SaaS', currentLead: 'Vikram Nair', callDuration: '05:12', callsToday: 31, talkTime: '5h 01m', conversion: 9 },
];

export const contacts = [
  { id: 'c1', name: 'Rajesh Kumar', phone: '+91 98765 43210', email: 'rajesh@abctech.in', company: 'ABC Technologies', status: 'Active', owner: 'Rahul Sharma', campaign: 'Delhi Real Estate', lastContact: '2026-09-18', nextFollowUp: '2026-09-20', tags: ['Hot Lead', 'Enterprise'], leadScore: 82 },
  { id: 'c2', name: 'Meena Iyer', phone: '+91 87654 32109', email: 'meena@meridian.com', company: 'Meridian Health', status: 'Active', owner: 'Priya Singh', campaign: 'Mumbai Finance', lastContact: '2026-09-17', nextFollowUp: '2026-09-21', tags: ['VIP'], leadScore: 75 },
  { id: 'c3', name: 'Arjun Bose', phone: '+91 76543 21098', email: 'arjun@novarealty.in', company: 'Nova Realty', status: 'Active', owner: 'Amit Verma', campaign: 'Pune Insurance', lastContact: '2026-09-16', nextFollowUp: null, tags: ['Callback'], leadScore: 58 },
  { id: 'c4', name: 'Sunita Desai', phone: '+91 65432 10987', email: 'sunita@vertex.io', company: 'Vertex Solutions', status: 'Inactive', owner: 'Neha Kapoor', campaign: '', lastContact: '2026-09-10', nextFollowUp: null, tags: [], leadScore: 34 },
  { id: 'c5', name: 'Vikram Nair', phone: '+91 54321 09876', email: 'vikram@cloudindia.com', company: 'Cloud India', status: 'Active', owner: 'Anjali Mehta', campaign: 'Hyderabad SaaS', lastContact: '2026-09-18', nextFollowUp: '2026-09-19', tags: ['Interested', 'High Priority'], leadScore: 91 },
  { id: 'c6', name: 'Kavitha Reddy', phone: '+91 43210 98765', email: 'kavitha@greenfields.in', company: 'Greenfields Corp', status: 'Active', owner: 'Priya Singh', campaign: 'Delhi Real Estate', lastContact: '2026-09-15', nextFollowUp: '2026-09-22', tags: ['Pricing'], leadScore: 67 },
  { id: 'c7', name: 'Rohan Gupta', phone: '+91 32109 87654', email: 'rohan@fincraft.com', company: 'FinCraft', status: 'Active', owner: 'Rahul Sharma', campaign: 'Mumbai Finance', lastContact: '2026-09-14', nextFollowUp: '2026-09-20', tags: ['Enterprise'], leadScore: 79 },
  { id: 'c8', name: 'Divya Krishnan', phone: '+91 21098 76543', email: 'divya@startech.in', company: 'StarTech India', status: 'Active', owner: 'Amit Verma', campaign: 'Hyderabad SaaS', lastContact: '2026-09-18', nextFollowUp: '2026-09-25', tags: ['Hot Lead'], leadScore: 88 },
];

export const leads = [
  { id: 'l1', name: 'Rajesh Kumar', company: 'ABC Technologies', phone: '+91 98765 43210', status: 'Interested', score: 82, owner: 'Rahul Sharma', campaign: 'Delhi Real Estate', lastContact: '2026-09-18', nextFollowUp: '2026-09-20', stage: 'Follow-up' },
  { id: 'l2', name: 'Vikram Nair', company: 'Cloud India', phone: '+91 54321 09876', status: 'Qualified', score: 91, owner: 'Anjali Mehta', campaign: 'Hyderabad SaaS', lastContact: '2026-09-18', nextFollowUp: '2026-09-19', stage: 'Qualified' },
  { id: 'l3', name: 'Divya Krishnan', company: 'StarTech India', phone: '+91 21098 76543', status: 'Interested', score: 88, owner: 'Amit Verma', campaign: 'Hyderabad SaaS', lastContact: '2026-09-18', nextFollowUp: '2026-09-25', stage: 'Follow-up' },
  { id: 'l4', name: 'Rohan Gupta', company: 'FinCraft', phone: '+91 32109 87654', status: 'New', score: 79, owner: 'Rahul Sharma', campaign: 'Mumbai Finance', lastContact: '2026-09-14', nextFollowUp: '2026-09-20', stage: 'Contacted' },
  { id: 'l5', name: 'Kavitha Reddy', company: 'Greenfields Corp', phone: '+91 43210 98765', status: 'Callback', score: 67, owner: 'Priya Singh', campaign: 'Delhi Real Estate', lastContact: '2026-09-15', nextFollowUp: '2026-09-22', stage: 'Contacted' },
  { id: 'l6', name: 'Meena Iyer', company: 'Meridian Health', phone: '+91 87654 32109', status: 'Interested', score: 75, owner: 'Priya Singh', campaign: 'Mumbai Finance', lastContact: '2026-09-17', nextFollowUp: '2026-09-21', stage: 'Qualified' },
  { id: 'l7', name: 'Arjun Bose', company: 'Nova Realty', phone: '+91 76543 21098', status: 'Not Interested', score: 58, owner: 'Amit Verma', campaign: 'Pune Insurance', lastContact: '2026-09-16', nextFollowUp: null, stage: 'New' },
  { id: 'l8', name: 'Sunita Desai', company: 'Vertex Solutions', phone: '+91 65432 10987', status: 'Converted', score: 34, owner: 'Neha Kapoor', campaign: '', lastContact: '2026-09-10', nextFollowUp: null, stage: 'Converted' },
  { id: 'l9', name: 'Pradeep Joshi', company: 'TechWave', phone: '+91 91234 56789', status: 'New', score: 62, owner: 'Suresh Patel', campaign: 'Delhi Real Estate', lastContact: null, nextFollowUp: null, stage: 'New' },
  { id: 'l10', name: 'Lakshmi Nair', company: 'Sunrise Pharma', phone: '+91 80987 65432', status: 'New', score: 71, owner: 'Anjali Mehta', campaign: 'Hyderabad SaaS', lastContact: null, nextFollowUp: '2026-09-21', stage: 'New' },
];

export const campaigns = [
  { id: 'camp1', name: 'Delhi Real Estate', status: 'Running', leads: 450, calls: 312, connected: 198, interested: 67, followUps: 43, conversions: 18, answerRate: 63, avgTalkTime: '4:12', agents: 4, mode: 'Progressive', startDate: '2026-09-01', endDate: '2026-09-30' },
  { id: 'camp2', name: 'Mumbai Finance', status: 'Running', leads: 280, calls: 201, connected: 134, interested: 41, followUps: 28, conversions: 11, answerRate: 67, avgTalkTime: '3:44', agents: 3, mode: 'Power', startDate: '2026-09-05', endDate: '2026-09-28' },
  { id: 'camp3', name: 'Pune Insurance', status: 'Paused', leads: 320, calls: 145, connected: 89, interested: 22, followUps: 15, conversions: 6, answerRate: 61, avgTalkTime: '3:02', agents: 2, mode: 'Preview', startDate: '2026-09-10', endDate: '2026-10-10' },
  { id: 'camp4', name: 'Hyderabad SaaS', status: 'Running', leads: 180, calls: 142, connected: 104, interested: 38, followUps: 24, conversions: 15, answerRate: 73, avgTalkTime: '5:01', agents: 3, mode: 'Progressive', startDate: '2026-09-12', endDate: '2026-09-30' },
  { id: 'camp5', name: 'Chennai Banking', status: 'Draft', leads: 0, calls: 0, connected: 0, interested: 0, followUps: 0, conversions: 0, answerRate: 0, avgTalkTime: '—', agents: 0, mode: 'Manual', startDate: '2026-10-01', endDate: '2026-10-31' },
  { id: 'camp6', name: 'Kolkata Retail', status: 'Completed', leads: 600, calls: 521, connected: 344, interested: 112, followUps: 0, conversions: 48, answerRate: 66, avgTalkTime: '3:55', agents: 5, mode: 'Power', startDate: '2026-08-01', endDate: '2026-08-31' },
];

export const callHistory = [
  { id: 'call1', customer: 'Rajesh Kumar', agent: 'Rahul Sharma', campaign: 'Delhi Real Estate', direction: 'Outbound', status: 'Connected', duration: '05:23', date: '2026-09-18 14:32', disposition: 'Interested', hasRecording: true },
  { id: 'call2', customer: 'Vikram Nair', agent: 'Anjali Mehta', campaign: 'Hyderabad SaaS', direction: 'Outbound', status: 'Connected', duration: '08:41', date: '2026-09-18 13:15', disposition: 'Callback Requested', hasRecording: true },
  { id: 'call3', customer: 'Meena Iyer', agent: 'Priya Singh', campaign: 'Mumbai Finance', direction: 'Inbound', status: 'Connected', duration: '03:18', date: '2026-09-18 12:08', disposition: 'Follow-up Required', hasRecording: true },
  { id: 'call4', customer: 'Arjun Bose', agent: 'Amit Verma', campaign: 'Pune Insurance', direction: 'Outbound', status: 'No Answer', duration: '00:00', date: '2026-09-18 11:44', disposition: 'No Answer', hasRecording: false },
  { id: 'call5', customer: 'Kavitha Reddy', agent: 'Priya Singh', campaign: 'Delhi Real Estate', direction: 'Outbound', status: 'Busy', duration: '00:00', date: '2026-09-18 10:22', disposition: 'Busy', hasRecording: false },
  { id: 'call6', customer: 'Divya Krishnan', agent: 'Amit Verma', campaign: 'Hyderabad SaaS', direction: 'Outbound', status: 'Connected', duration: '12:07', date: '2026-09-18 09:55', disposition: 'Interested', hasRecording: true },
  { id: 'call7', customer: 'Rohan Gupta', agent: 'Rahul Sharma', campaign: 'Mumbai Finance', direction: 'Outbound', status: 'Voicemail', duration: '01:02', date: '2026-09-17 17:30', disposition: 'Voicemail', hasRecording: true },
  { id: 'call8', customer: 'Sunita Desai', agent: 'Neha Kapoor', campaign: 'Delhi Real Estate', direction: 'Inbound', status: 'Connected', duration: '06:44', date: '2026-09-17 16:10', disposition: 'Converted', hasRecording: true },
];

export const followUps = [
  { id: 'f1', customer: 'Rajesh Kumar', agent: 'Rahul Sharma', reason: 'Send pricing document', dueDate: '2026-09-19', dueTime: '14:00', priority: 'High', status: 'due' },
  { id: 'f2', customer: 'Vikram Nair', agent: 'Anjali Mehta', reason: 'Callback - premium plan inquiry', dueDate: '2026-09-19', dueTime: '16:30', priority: 'High', status: 'due' },
  { id: 'f3', customer: 'Meena Iyer', agent: 'Priya Singh', reason: 'Follow up on proposal', dueDate: '2026-09-19', dueTime: '11:00', priority: 'Medium', status: 'overdue' },
  { id: 'f4', customer: 'Kavitha Reddy', agent: 'Priya Singh', reason: 'Discuss pricing options', dueDate: '2026-09-20', dueTime: '10:00', priority: 'Medium', status: 'upcoming' },
  { id: 'f5', customer: 'Rohan Gupta', agent: 'Rahul Sharma', reason: 'Second call attempt', dueDate: '2026-09-20', dueTime: '15:00', priority: 'Low', status: 'upcoming' },
  { id: 'f6', customer: 'Divya Krishnan', agent: 'Amit Verma', reason: 'Contract review', dueDate: '2026-09-22', dueTime: '09:00', priority: 'High', status: 'upcoming' },
];

export const kpiData = {
  totalCalls: { value: 847, trend: +12.4, period: 'vs yesterday' },
  connected: { value: 534, trend: +8.2, period: 'vs yesterday' },
  missed: { value: 89, trend: -5.1, period: 'vs yesterday' },
  activeAgents: { value: 18, trend: 0, period: 'right now' },
  talkTime: { value: '42h 18m', trend: +15.2, period: 'vs yesterday' },
  conversionRate: { value: '12.4%', trend: +2.1, period: 'vs yesterday' },
  followUpsDue: { value: 31, trend: 0, period: 'today' },
  avgCallDuration: { value: '4m 22s', trend: -0.8, period: 'vs yesterday' },
  answerRate: { value: '63.1%', trend: +1.3, period: 'vs yesterday' },
};

export const hourlyCallData = [
  { hour: '8am', calls: 42, connected: 28 },
  { hour: '9am', calls: 98, connected: 64 },
  { hour: '10am', calls: 134, connected: 87 },
  { hour: '11am', calls: 118, connected: 76 },
  { hour: '12pm', calls: 67, connected: 41 },
  { hour: '1pm', calls: 89, connected: 58 },
  { hour: '2pm', calls: 142, connected: 91 },
  { hour: '3pm', calls: 156, connected: 102 },
  { hour: '4pm', calls: 121, connected: 79 },
  { hour: '5pm', calls: 85, connected: 55 },
  { hour: '6pm', calls: 48, connected: 31 },
];

export const dispositionData = [
  { name: 'Interested', value: 187, color: '#22C55E' },
  { name: 'Callback', value: 134, color: '#3B82F6' },
  { name: 'Not Interested', value: 98, color: '#EF4444' },
  { name: 'No Answer', value: 89, color: '#94A3B8' },
  { name: 'Voicemail', value: 54, color: '#F59E0B' },
  { name: 'Converted', value: 49, color: '#8B5CF6' },
  { name: 'Other', value: 23, color: '#64748B' },
];

export const phoneNumbers = [
  { id: 'ph1', number: '+91 11 4567 8900', country: 'India', type: 'Local', status: 'Active', team: 'Sales Alpha', campaign: 'Delhi Real Estate', callerId: 'ProCaller Delhi' },
  { id: 'ph2', number: '+91 22 4567 8901', country: 'India', type: 'Local', status: 'Active', team: 'Sales Beta', campaign: 'Mumbai Finance', callerId: 'ProCaller Mumbai' },
  { id: 'ph3', number: '+1 415 555 0192', country: 'USA', type: 'Toll-Free', status: 'Active', team: 'Sales Gamma', campaign: 'Hyderabad SaaS', callerId: 'ProCaller International' },
  { id: 'ph4', number: '+91 40 4567 8902', country: 'India', type: 'Local', status: 'Inactive', team: '', campaign: '', callerId: 'ProCaller Hyderabad' },
];

export const recordings = [
  { id: 'rec1', customer: 'Rajesh Kumar', agent: 'Rahul Sharma', campaign: 'Delhi Real Estate', date: '2026-09-18 14:32', duration: '05:23', aiSummary: 'Customer expressed strong interest in premium plan. Requested pricing document and follow-up call tomorrow at 4 PM. Mentioned budget approval needed from CFO.', sentiment: 'Positive', keyTopics: ['Pricing', 'Premium Plan', 'Budget'], actionItems: ['Send pricing document', 'Schedule follow-up for Sep 19 at 4 PM'], suggestedDisposition: 'Interested', score: 87 },
  { id: 'rec2', customer: 'Vikram Nair', agent: 'Anjali Mehta', campaign: 'Hyderabad SaaS', date: '2026-09-18 13:15', duration: '08:41', aiSummary: 'Detailed discussion about enterprise integration requirements. Customer has technical team evaluating API capabilities. Implementation timeline discussed - targeting Q4 go-live.', sentiment: 'Positive', keyTopics: ['API Integration', 'Enterprise', 'Q4 Timeline'], actionItems: ['Send API documentation', 'Schedule technical demo'], suggestedDisposition: 'Qualified', score: 92 },
  { id: 'rec3', customer: 'Meena Iyer', agent: 'Priya Singh', campaign: 'Mumbai Finance', date: '2026-09-18 12:08', duration: '03:18', aiSummary: 'Inbound inquiry about healthcare module. Customer interested but needs to consult with compliance team. Requested brochure.', sentiment: 'Neutral', keyTopics: ['Healthcare', 'Compliance', 'Brochure'], actionItems: ['Send healthcare module brochure', 'Wait for compliance review'], suggestedDisposition: 'Follow-up Required', score: 71 },
];

export const auditLogs = [
  { id: 'log1', user: 'Rahul Sharma', action: 'Updated lead', resource: 'Rajesh Kumar', date: '2026-09-18 14:35', ip: '192.168.1.42', status: 'Success' },
  { id: 'log2', user: 'Admin', action: 'Created campaign', resource: 'Chennai Banking', date: '2026-09-18 11:20', ip: '192.168.1.10', status: 'Success' },
  { id: 'log3', user: 'Priya Singh', action: 'Exported contacts', resource: 'Mumbai Finance contacts', date: '2026-09-18 10:05', ip: '192.168.1.55', status: 'Success' },
  { id: 'log4', user: 'Unknown', action: 'Failed login', resource: 'admin@dialpro.io', date: '2026-09-18 09:12', ip: '203.122.44.91', status: 'Failed' },
  { id: 'log5', user: 'Amit Verma', action: 'Changed role', resource: 'Neha Kapoor → Senior Agent', date: '2026-09-17 17:00', ip: '192.168.1.33', status: 'Success' },
];
