// Global type declarations for event metadata
declare global {
  interface EventMetadata {
    linkedAssignmentId?: string;
    chunkIndex?: number;
    totalChunks?: number;
    chunkType?: string;
    eventTitle?: string;
    title?: string;
    originalStartAt?: string;
    originalEndAt?: string;
    assignmentId?: string;
    title_hint?: string;
    isCompleted?: boolean;
    completedAt?: string;
    linkedToEvent?: string;
    priority?: string;
    [key: string]: any;
  }
}

export {};

