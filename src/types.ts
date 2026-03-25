export type UserRole = 'admin' | 'president' | 'member';

export interface UserProfile {
  id: string;
  name: string;
  role: UserRole;
  clubId?: string;
  hpReduced: number;
  dragonHp?: number;
  lastLogin: string;
}

export interface Club {
  id: string;
  name: string;
  presidentId?: string;
}

export interface DragonState {
  hp: number;
}
