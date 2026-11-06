import {test,expect} from '@playwright/test';
import {installApi} from './api.js';

test('telefone aplica máscara, limita dígitos, valida e persiste sem tornar o contato obrigatório',async({page})=>{
  const api=await installApi(page,{signedIn:true});await page.setViewportSize({width:390,height:844});
  await page.goto('/#/conta');const phone=page.getByLabel('Telefone',{exact:true});
  await expect(phone).toHaveAttribute('maxlength','15');await expect(phone).toHaveAttribute('inputmode','tel');
  await phone.pressSequentially('11912345678');await expect(phone).toHaveValue('(11) 91234-5678');
  await phone.pressSequentially('9999');await expect(phone).toHaveValue('(11) 91234-5678');
  await page.getByRole('button',{name:'Salvar alterações',exact:true}).click();
  await expect(page.getByText('Alterações salvas.',{exact:true})).toBeVisible();expect(api.profile.phone).toBe('(11) 91234-5678');
  await page.reload();await expect(phone).toHaveValue('(11) 91234-5678');
  await phone.fill('119123');await page.getByRole('button',{name:'Salvar alterações',exact:true}).click();
  await expect(phone).toHaveAttribute('aria-invalid','true');await expect(phone).toBeFocused();expect(api.profile.phone).toBe('(11) 91234-5678');
  await phone.fill('2130001234');await expect(phone).toHaveValue('(21) 3000-1234');
  await phone.fill('');await page.getByRole('button',{name:'Salvar alterações',exact:true}).click();
  await expect(page.getByText('Alterações salvas.',{exact:true})).toBeVisible();expect(api.profile.phone).toBe(null);
});

test('telefone permite colar +55, corrigir no meio e apagar separadores sem prender o cursor',async({page})=>{
  await installApi(page,{signedIn:true});await page.goto('/#/conta');const phone=page.getByLabel('Telefone',{exact:true});
  await phone.evaluate(input=>{
    input.focus();const clipboardData=new DataTransfer();clipboardData.setData('text','+55 (11) 91234-5678');
    input.dispatchEvent(new ClipboardEvent('paste',{clipboardData,bubbles:true,cancelable:true}));
  });
  await expect(phone).toHaveValue('(11) 91234-5678');
  await phone.evaluate(input=>input.setSelectionRange(11,11));await phone.press('Backspace');
  expect((await phone.inputValue()).replace(/\D/g,'')).toBe('1191235678');
  await phone.fill('11912345678');await phone.evaluate(input=>input.setSelectionRange(6,7));await phone.pressSequentially('8');
  await expect(phone).toHaveValue('(11) 98234-5678');
  await page.screenshot({path:'work/phone-mask-desktop.png'});
});
