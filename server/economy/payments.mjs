import {products,requireValue} from './rules.mjs';
export function paidProduct(item){if(item==='coins')return {stars:49};const p=products.get(item);requireValue(p?.stars,'unknown paid product');return p;}
export async function createOrder(db,uid,item,id){const p=paidProduct(item);requireValue(/^[A-Za-z0-9:_-]{8,100}$/.test(id),'invalid order');
 const existing=await db.prepare('SELECT * FROM econ_orders WHERE id=?').bind(id).first();
 if(existing){requireValue(existing.uid===uid&&existing.item===item,'order conflict');return existing;}
 const order={id,uid,item,stars:p.stars,created_ms:Date.now()};
 await db.prepare('INSERT INTO econ_orders VALUES (?,?,?,?,?)').bind(id,uid,item,p.stars,order.created_ms).run();return order;
}
export async function validatePayment(db,uid,payment){
 requireValue(payment.currency==='XTR','invalid currency');let data;try{data=JSON.parse(payment.invoice_payload);}catch{throw Error('invalid payment');}
 requireValue(data?.v===2&&data.uid===uid&&typeof data.order==='string','invalid payment');
 const order=await db.prepare('SELECT * FROM econ_orders WHERE id=? AND uid=?').bind(data.order,uid).first();
 requireValue(order&&order.stars===payment.total_amount&&paidProduct(order.item).stars===payment.total_amount,'payment mismatch');return order;
}
export async function recordPayment(db,uid,payment){
 const order=await validatePayment(db,uid,payment);const charge=payment.telegram_payment_charge_id;
 requireValue(typeof charge==='string'&&charge.length>0&&charge.length<=256,'invalid charge');
 const old=await db.prepare('SELECT * FROM econ_receipts WHERE charge=? OR order_id=?').bind(charge,order.id).all();
 if(old.results.length){const r=old.results[0];requireValue(old.results.length===1&&r.charge===charge&&r.order_id===order.id&&r.uid===uid&&r.stars===order.stars,'duplicate payment requires review');return order;}
 try{await db.prepare('INSERT INTO econ_receipts VALUES (?,?,?,?,?)').bind(charge,order.id,uid,order.stars,Date.now()).run();}catch(e){const r=await db.prepare('SELECT * FROM econ_receipts WHERE charge=?').bind(charge).first();requireValue(r&&r.order_id===order.id&&r.uid===uid&&r.stars===order.stars,'payment conflict');}
 return order;
}
