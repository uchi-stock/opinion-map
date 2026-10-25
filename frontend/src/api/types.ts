export type OpinionKind = "experience" | "question" | "idea";

export interface PublicSession {
  id: string;
  title: string;
  prompt: string;
  format: "talk" | "workshop" | "ost";
  status: "draft" | "active" | "closed";
  eventName: string;
  acceptingOpinions: boolean;
  showOpinions: boolean;
}

export interface PublicOpinion {
  id: string;
  body: string;
  kind: OpinionKind;
  createdAt: string;
}

export interface OpinionList {
  hidden: boolean;
  opinions: PublicOpinion[];
}

export interface OpinionSubmission {
  body: string;
  kind: OpinionKind;
  submissionId: string;
}

export interface OpinionResult {
  opinion: PublicOpinion;
  duplicate: boolean;
}

export type EventStatus = "draft" | "active" | "archived";
export type SessionStatus = "draft" | "active" | "closed";
export type SessionFormat = "talk" | "workshop" | "ost";

export interface EventRecord {
  id: string;
  name: string;
  description: string;
  status: EventStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SessionRecord {
  id: string;
  eventId: string;
  title: string;
  prompt: string;
  format: SessionFormat;
  status: SessionStatus;
  showOpinionsToParticipants: boolean;
  createdAt: string;
  updatedAt: string;
}
