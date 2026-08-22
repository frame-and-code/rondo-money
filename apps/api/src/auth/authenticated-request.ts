export interface RequestAuth {
  userId: string;
}

export interface AuthenticatedRequest {
  headers: { authorization?: string };
  auth?: RequestAuth;
}
