# Dash Engage

Base administrativa com login, JWT e controle de usuarios/permissoes.

## Variaveis de ambiente

Copie `.env.example` para `.env.local` no desenvolvimento local e configure:

- `DATABASE_URL`: URL do PostgreSQL.
- `JWT_SECRET`: segredo usado para assinar os tokens.
- `DB_SSL`: use `true` quando o banco exigir SSL.
- `ADMIN_EMAIL` e `ADMIN_PASSWORD`: usados apenas pelo script `npm run seed`.

## Desenvolvimento

```bash
npm install
npm run start
```

Frontend: `http://localhost:3041`

Backend: `http://localhost:3040`

## Banco e primeiro admin

```bash
npm run seed
```

O seed cria a tabela `users`, cria/atualiza o primeiro administrador e concede a permissao `usuarios`.
