import test from 'node:test';
import assert from 'node:assert/strict';
import {formatBrazilianPhone,normalizeBrazilianPhone} from '../src/utils/phone.js';
import {validateProfile,ValidationError} from '../src/modules/auth/validation.js';

test('telefone brasileiro normaliza celular/fixo com DDD e código 55 opcional',()=>{
  for(const [value,expected] of [
    ['11912345678','11912345678'],['(11) 91234-5678','11912345678'],
    ['+55 (11) 91234-5678','11912345678'],['5511912345678','11912345678'],
    ['(21) 3000-1234','2130001234'],['+55 21 3000-1234','2130001234'],
    ['(55) 91234-5678','55912345678'],
  ])assert.equal(normalizeBrazilianPhone(value),expected);
});

test('telefone recusa número incompleto, DDD zero, excesso, texto e celular sem o nono dígito',()=>{
  for(const value of ['',null,'123','01912345678','10912345678','1191234567','11812345678','119123456789','11912345678 ramal 1','+1 212 555 1212']){
    assert.equal(normalizeBrazilianPhone(value),null,String(value));
  }
});

test('máscara tem 15 caracteres e limita a 11 dígitos sem cortar a entrada da validação',()=>{
  assert.equal(formatBrazilianPhone('11912345678'),'(11) 91234-5678');
  assert.equal(formatBrazilianPhone('2130001234'),'(21) 3000-1234');
  assert.equal(formatBrazilianPhone('+55 (11) 91234-5678'),'(11) 91234-5678');
  assert.equal(formatBrazilianPhone('119123456789999'),'(11) 91234-5678');
  assert.equal(formatBrazilianPhone(''), '');
});

test('perfil mantém telefone opcional, grava máscara canônica e associa erro ao campo',()=>{
  assert.deepEqual(validateProfile({full_name:'Pessoa',phone:''}),{full_name:'Pessoa',phone:null});
  assert.equal(validateProfile({full_name:'Pessoa',phone:'11912345678'}).phone,'(11) 91234-5678');
  assert.equal(validateProfile({full_name:'Pessoa',phone:'+55 11 91234-5678'}).phone,'(11) 91234-5678');
  assert.throws(()=>validateProfile({full_name:'Pessoa',phone:'1191234567'}),error=>error instanceof ValidationError&&Boolean(error.fields.phone));
});
