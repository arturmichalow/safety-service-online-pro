export default function ForgotPasswordPage() {
  return (
    <div className="login">
      <form
        className="loginBox"
        action="/api/account/forgot-password"
        method="POST"
      >
        <h1>Reset hasła</h1>

        <input
          type="email"
          name="email"
          placeholder="Twój adres e-mail"
          required
        />

        <button className="orange">
          Wyślij link resetujący
        </button>
      </form>
    </div>
  );
}