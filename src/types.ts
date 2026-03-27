export type UserRole = 'admin' | 'president' | 'member';

export interface UserProfile {
  id: string;
  name: string;
  role: UserRole;
  clubId?: string;
  hpReduced: number;
  dragonHp?: number;
  lastLogin: string;
  streak?: number;
  lastAttackDate?: string;
  tripleUsed?: boolean;
}

export interface Club {
  id: string;
  name: string;
  presidentId?: string;
}

export interface DragonState {
  hp: number;
}
