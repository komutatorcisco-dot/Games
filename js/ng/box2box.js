// «Box2Box на время»: та же сетка, что в Тики-Така-Тоу, но одному и на скорость (код режима — в js/ttt.js).
'use strict';

NG.register({
  id: 'box2box', group: 'grid', title: 'Box2Box на время', c1: '#c65bd8', c2: '#2f6fe4', tag: 'Сетка за 3 минуты', act: 'b2b',
  meta: () => (Store.d.ttt.b2bBest ? `Рекорд ${Store.d.ttt.b2bBest}` : 'Сетка за 3 минуты'),
  start() { TTT.start('timed'); },
});
