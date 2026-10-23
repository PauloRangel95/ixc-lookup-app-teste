// os-acao — ESCRITA/LEITURA de OS no IXC. DEPLOY NO n8n DE TESTE.
// Leitura (sem trava): acao='eventos' | 'respostas' | 'os' (id_chamado)
// Escrita (trava OS teste): acao='mensagem' { id_chamado, mensagem, id_tecnico, id_evento?, status?, tipo_cobranca? }
const IXC_BASE  = 'https://ixc.carajasnet.com/webservice/v1';
const IXC_AUTH  = 'COLE_BASE64_OU_usuario:token'; // mesmo auth do ixc-leituras (base64 após "Basic ", OU "usuario:token")
const SOMENTE_OS_TESTE = '';                       // ex.: '1167584' p/ travar; '' = sem trava (cuidado)

function authHeader(){ let v=String(IXC_AUTH).replace(/^Basic\s+/i,'').trim(); if(v.includes(':')) v=Buffer.from(v,'utf8').toString('base64'); return 'Basic '+v; }
function nowIX(){ const d=new Date(), p=n=>String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds()); }
// Datas de agendamento no IXC exigem formato BR dd/mm/aaaa hh:mm:ss
function brDate(ms){ const d=new Date(ms==null?Date.now():ms), p=n=>String(n).padStart(2,'0'); return p(d.getDate())+'/'+p(d.getMonth()+1)+'/'+d.getFullYear()+' '+p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds()); }
async function ixcWrite(endpoint, payload){ return await this.helpers.httpRequest({ method:'POST', url:`${IXC_BASE}/${endpoint}`,
  headers:{ 'Authorization':authHeader(), 'Content-Type':'application/json' }, body:payload, json:true }); }
async function ixcList(endpoint, params){ return await this.helpers.httpRequest({ method:'POST', url:`${IXC_BASE}/${endpoint}`,
  headers:{ 'Authorization':authHeader(), 'ixcsoft':'listar', 'Content-Type':'application/json' }, body:params||{}, json:true }); }
function errInfo(e){ const c=e.httpCode||e.statusCode||(e.response&&e.response.statusCode)||''; let d=''; try{ const b=e.response&&e.response.body; if(b) d=typeof b==='string'?b:JSON.stringify(b); }catch(_){} return 'IXC: HTTP '+c+' '+(e.message||'')+(d?(' :: '+String(d).slice(0,700)):''); }

const body = $input.first().json.body || $input.first().json;
const acao = String(body.acao || '').trim();

try {
  // ── RAW (TESTE/descoberta — REMOVER antes de ir pra produção) ──
  if (acao === 'raw'){
    const ep = String(body.endpoint||'').trim(); const pl = body.payload||{};
    if (!ep) return [{ json:{ ok:false, erro:'endpoint é obrigatório no raw' } }];
    const r = await ixcWrite.call(this, ep, pl);
    return [{ json:{ ok:true, endpoint:ep, payload_enviado:pl, resposta:r } }];
  }
  // ── LEITURA (sem trava) ──
  if (acao === 'eventos'){
    const r = await ixcList.call(this,'su_oss_evento',{ qtype:'su_oss_evento.id', query:'0', oper:'>', rp:'200', page:'1', sortname:'su_oss_evento.id', sortorder:'asc' });
    return [{ json:{ ok:true, total:(r&&r.total), eventos:(r&&r.registros)||r } }];
  }
  if (acao === 'respostas'){
    const r = await ixcList.call(this,'su_oss_respostas',{ qtype:'su_oss_respostas.id', query:'0', oper:'>', rp:'200', page:'1', sortname:'su_oss_respostas.id', sortorder:'asc' });
    return [{ json:{ ok:true, total:(r&&r.total), respostas:(r&&r.registros)||r } }];
  }
  if (acao === 'os'){
    const id=String(body.id_chamado||'').trim(); if(!id) return [{ json:{ ok:false, erro:'id_chamado' } }];
    const r = await ixcList.call(this,'su_oss_chamado',{ qtype:'su_oss_chamado.id', query:id, oper:'=', rp:'1', page:'1', sortname:'su_oss_chamado.id', sortorder:'asc' });
    return [{ json:{ ok:true, os:(r&&r.registros&&r.registros[0])||null } }];
  }
  if (acao === 'listar'){
    const ep = String(body.endpoint||'').trim(); if(!ep) return [{json:{ok:false,erro:'endpoint'}}];
    const params = body.params || { qtype:ep+'.id', query:'0', oper:'>', rp:'500', page:'1', sortname:ep+'.id', sortorder:'asc' };
    const r = await ixcList.call(this, ep, params);
    return [{json:{ok:true, endpoint:ep, total:(r&&r.total), registros:(r&&r.registros)||r}}];
  }

  // ── ESCRITA (trava OS teste) ──
  const idChamado = String(body.id_chamado || '').trim();
  if (!idChamado) return [{ json:{ ok:false, erro:'id_chamado é obrigatório' } }];
  if (SOMENTE_OS_TESTE && idChamado !== SOMENTE_OS_TESTE) return [{ json:{ ok:false, erro:'nesta fase só a OS '+SOMENTE_OS_TESTE } }];

  if (acao === 'mensagem'){
    const msg = String(body.mensagem || '').trim();
    if (!msg) return [{ json:{ ok:false, erro:'mensagem é obrigatória' } }];
    const payload = { id_chamado:idChamado, mensagem:msg, id_tecnico:String(body.id_tecnico||''), data_inicio:nowIX(), data_final:nowIX(),
      tipo_cobranca: (body.tipo_cobranca!=null?String(body.tipo_cobranca):'NENHUM') };
    if (body.id_evento) payload.id_evento = String(body.id_evento);
    if (body.status)    payload.status    = String(body.status);
    const r = await ixcWrite.call(this, 'su_oss_chamado_mensagem', payload);
    return [{ json:{ ok:true, acao, id_chamado:idChamado, payload_enviado:payload, resposta:r } }];
  }
  // MARCAR P/ AGENDAMENTO (técnico) → OS vai pra RAG; O&M reagenda depois. Datas em formato BR.
  if (acao === 'reagendar'){
    const now = brDate();
    const payload = { id_chamado:idChamado, status:'RAG', id_evento:'10',
      mensagem: String(body.mensagem || 'Marcada para agendamento pelo técnico.'),
      id_tecnico: String(body.id_tecnico||''),
      data: now, data_agendamento: now, data_agendamento_final: brDate(Date.now()+2*3600000) };
    const r = await ixcWrite.call(this, 'su_oss_chamado_reagendar', payload);
    return [{ json:{ ok:true, acao, id_chamado:idChamado, resposta:r } }];
  }
  // INICIAR DESLOCAMENTO (1º passo) → status DS (via executar + evento 17)
  if (acao === 'deslocamento'){
    const payload = { id_chamado:idChamado, status:'DS', id_evento:'17',
      mensagem: String(body.mensagem || 'Iniciou deslocamento.'), id_tecnico: String(body.id_tecnico||''), data: brDate() };
    const r = await ixcWrite.call(this, 'su_oss_chamado_executar', payload);
    return [{ json:{ ok:true, acao, id_chamado:idChamado, resposta:r } }];
  }
  // EXECUTAR (técnico começou/chegou) → status EX
  if (acao === 'executar'){
    const payload = { id_chamado:idChamado, status:'EX', id_evento:'9',
      mensagem: String(body.mensagem || 'Em execução.'), id_tecnico: String(body.id_tecnico||''), data: brDate() };
    const r = await ixcWrite.call(this, 'su_oss_chamado_executar', payload);
    return [{ json:{ ok:true, acao, id_chamado:idChamado, resposta:r } }];
  }
  // FINALIZAR → status F (exige data_inicio e data_final)
  if (acao === 'finalizar'){
    const now = brDate();
    const payload = { id_chamado:idChamado, status:'F', id_evento:'6',
      mensagem: String(body.mensagem || 'Finalizada.'), id_tecnico: String(body.id_tecnico||''),
      data: now, data_inicio: now, data_final: now };
    if (body.id_resposta) payload.id_resposta = String(body.id_resposta);
    if (body.id_su_diagnostico) payload.id_su_diagnostico = String(body.id_su_diagnostico);
    const r = await ixcWrite.call(this, 'su_oss_chamado_fechar', payload);
    return [{ json:{ ok:true, acao, id_chamado:idChamado, resposta:r } }];
  }
  // ANEXO → anexa arquivo (base64) na OS. { arquivo (base64/dataURI), nome_arquivo?, descricao?, classificacao? }
  if (acao === 'anexo'){
    const arq = String(body.arquivo || '').trim();
    if (!arq) return [{ json:{ ok:false, erro:'arquivo (base64) é obrigatório' } }];
    const payload = { id_oss_chamado:idChamado, descricao:String(body.descricao||'Anexo'),
      classificacao_arquivo:String(body.classificacao||'P'), local_arquivo:arq };
    if (body.nome_arquivo) payload.nome_arquivo = String(body.nome_arquivo);
    const r = await ixcWrite.call(this, 'su_oss_chamado_arquivos', payload);
    return [{ json:{ ok:true, acao, id_chamado:idChamado, id:(r&&r.id)||null, resposta:r } }];
  }
  return [{ json:{ ok:false, erro:'ação não suportada: '+acao } }];
} catch(e){
  return [{ json:{ ok:false, erro: errInfo(e) } }];
}
