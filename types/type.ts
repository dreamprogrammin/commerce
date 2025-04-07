export interface ParamsSignUp {
  email: string;
  password: string;
  confirmPassword: string;
}

export interface IUserMetaData {
  first_name: string;
  last_name?: string;
}

export interface IParamsForgotPassword {
  email: string;
  option: {
    redirectTo: string;
  };
}

export interface IProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
}
