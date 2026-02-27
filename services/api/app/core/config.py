from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "coachella-api"
    app_env: str = "local"
    app_version: str = "0.1.0"
    api_prefix: str = "/v1"
    sqlite_path: str = "./coachella.db"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
