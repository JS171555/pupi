import { el, link, heading } from '../../ui/dom.js';
import { makeForm } from '../../ui/forms.js';
import { ValidationError } from './validation.js';

const email = { name: 'email', label: 'E-mail', type: 'email', required: true, autocomplete: 'email', maxLength: 254 };
const password = { name: 'password', label: 'Senha', type: 'password', required: true, autocomplete: 'current-password' };
const newPassword = { ...password, autocomplete: 'new-password', hint: 'De 12 a 128 caracteres, com maiúscula, minúscula e número.' };
const confirmation = { name: 'confirmation', label: 'Confirme a senha', type: 'password', required: true, autocomplete: 'new-password' };
const accepted = { name: 'accepted', label: 'Li o aviso de testes e quero criar uma conta neste ambiente.', type: 'checkbox', required: true };
const noticeLink = () => link('Ler aviso de testes', '#/aviso', { target: '_blank', rel: 'noopener' });

export function authView(route, context) {
  const { auth, busy, go, onLogin, announce, googleButton } = context;
  let form; let title; let intro; let footer;
  if (route === '/cadastro') {
    title = 'Crie sua conta'; intro = 'Cadastre-se para testar a área do cliente do Pupi.';
    form = makeForm({ name: 'Criar conta', submitLabel: 'Criar conta', onBusy: busy,
      fields: [{ name: 'full_name', label: 'Nome completo', required: true, autocomplete: 'name', maxLength: 160 }, email, newPassword, confirmation, accepted],
      onSubmit: async (values, formNode) => {
        const result = await auth.signUp(values); formNode.reset();
        if (result.session) await onLogin();
        else await go('/entrar', { force: true });
        announce(result.session ? 'Conta criada. Você já pode conferir seus dados.' :
          'Se o cadastro puder ser concluído, você receberá um e-mail. Confira sua caixa de entrada e confirme o endereço antes de entrar.', 'success');
      },
    });
    footer = el('div', { className: 'form-links' }, [noticeLink(), link('Já tenho conta', '#/entrar')]);
  } else if (route === '/recuperar') {
    title = 'Recuperar acesso'; intro = 'Peça um link para escolher uma nova senha. Abra-o neste mesmo navegador.';
    form = makeForm({ name: 'Recuperar acesso', submitLabel: 'Enviar link de recuperação', onBusy: busy, fields: [email],
      onSubmit: async values => {
        await auth.recover(values);
        announce('Se houver uma conta com esse e-mail, você receberá um link de recuperação. Confira também a pasta de spam.', 'success');
      },
    });
    footer = link('Voltar para entrar', '#/entrar');
  } else if (route === '/nova-senha') {
    title = 'Escolha uma nova senha'; intro = 'A alteração será confirmada pelo serviço de autenticação.';
    if (!context.recovery) {
      return el('section', { className: 'panel' }, [heading('Link de recuperação necessário', 'Abra um link válido recebido por e-mail neste navegador.'),
        link('Pedir outro link', '#/recuperar', { className: 'button button-primary' })]);
    }
    form = makeForm({ name: 'Nova senha', submitLabel: 'Salvar nova senha', onBusy: busy, fields: [newPassword, confirmation],
      onSubmit: async (values, formNode) => {
        await auth.resetPassword(values); formNode.reset();
        context.clearRecovery();
        await auth.signOut();
        await go('/entrar', { force: true });
        announce('Senha alterada. Entre novamente com sua nova senha.', 'success');
      },
    });
    footer = link('Pedir outro link', '#/recuperar');
  } else {
    title = 'Entre na sua conta'; intro = 'Acesse seus dados, endereços e pedidos.';
    form = makeForm({ name: 'Entrar', submitLabel: 'Entrar', onBusy: busy, fields: [email, password],
      onSubmit: async (values, formNode) => { await auth.signIn(values); formNode.reset(); await onLogin(); },
    });
    footer = el('div', { className: 'form-links' }, [link('Esqueci minha senha', '#/recuperar'), link('Criar conta', '#/cadastro')]);
  }
  const card = el('section', { className: 'panel' }, [heading(title, intro), form, footer]);
  if (route === '/entrar' || route === '/cadastro') card.append(el('div', { className: 'separator' }, 'ou'), googleButton());
  return card;
}

export function noticeView() {
  return el('section', { className: 'panel' }, [heading('Aviso de testes', 'Versão testing-v1'),
    el('p', {}, 'O Pupi está em desenvolvimento. Cadastro, perfil e endereços são gravados no projeto Supabase conectado ao aplicativo.'),
    el('p', {}, 'Esta etapa permite testar autenticação e dados de conta. Compras e pagamentos ainda não estão disponíveis.'),
    el('p', {}, 'O aceite confirma que você entendeu que está usando um ambiente de testes. Este aviso não substitui os Termos de Uso e a Política de Privacidade da futura loja.'),
    link('Voltar para criar conta', '#/cadastro', { className: 'button button-secondary' }),
  ]);
}

export function onboardingView(context) {
  const form = makeForm({ name: 'Aviso de testes', submitLabel: 'Continuar para minha conta', onBusy: context.busy, fields: [accepted],
    onSubmit: async values => {
      if (!values.accepted) throw new ValidationError({ accepted: 'Leia e aceite o aviso para continuar.' });
      await context.accept();
    },
  });
  return el('section', { className: 'panel' }, [heading('Antes de continuar', 'Seu acesso foi validado. Leia o aviso para usar este ambiente.'), noticeLink(), form]);
}
