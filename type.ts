export interface ParamsSignUp {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName?: string;
}

export interface IUserMetaData {
  first_name: string;
  last_name?: string;
}
