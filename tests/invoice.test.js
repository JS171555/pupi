import test from 'node:test';
import assert from 'node:assert/strict';
import {isValidNfeKey} from '../src/modules/admin/invoice.js';

test('chave de NF-e valida modelo 55 e dígito verificador',()=>{
  const valid='35261112345678000195550010000001231123456788';
  assert.equal(isValidNfeKey(valid),true);
  assert.equal(isValidNfeKey(valid.slice(0,43)+'0'),false);
  assert.equal(isValidNfeKey(valid.slice(0,20)+'65'+valid.slice(22)),false);
  assert.equal(isValidNfeKey('123'),false);
});
