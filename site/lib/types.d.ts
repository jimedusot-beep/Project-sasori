export type Evidence =
  'historical' | 'community-reported' | 'observed-this-session' | 'synthetic' | 'unknown';
export type SessionSource = 'live' | 'simulated' | 'imported';
export interface Packet {
  timestamp: string;
  characteristic: string;
  length: number;
  hex: string;
  text: string;
  kind: string;
  description: string;
  truncated: boolean;
  malformed: boolean;
}
export interface Capability {
  id: string;
  label: string;
  verified: boolean;
  evidence: string | null;
}
export interface DeviceProfile {
  id: string;
  label: string;
  deviceName: string | null;
  status: string;
  service: string | null;
  notify: string | null;
  source: string | null;
}
export interface TransportAdapter {
  connect(config: { service: string; notify: string; durationMs: number }): Promise<void>;
  disconnect(reason?: string): void;
}
