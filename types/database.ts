
export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  role: "user" | "admin";
  created_at: string;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  owner: string;
  created_at: string;
}

export interface Deck {
  id: string;
  title: string;
  course_id: string;
  owner: string;
  created_at: string;
}

export interface Flashcard {
  id: string;
  question: string;
  answer: string;
  deck_id: string;
  owner: string;
  created_at: string;
}

export interface QuizResult {
  id: string;
  deck_id: string;
  user_id: string;
  score: number;
  total: number;
  created_at: string;
}