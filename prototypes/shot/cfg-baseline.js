// Исходные настройки физики и ведения (версия, которая понравилась на телефоне, 17.10.2026) — для сравнения.
// Включаются ссылкой ?cfg=baseline: все значения BP.CFG заменяются этими.
export const BASELINE = {
 "dt": 0.004166666666666667,
 "maxFrame": 0.1,
 "g": 9.81,
 "R": 0.11,
 "mass": 0.43,
 "air": {
  "rho": 1.2,
  "cdLow": 0.45,
  "cdHigh": 0.2,
  "cdMid": 12,
  "cdWidth": 1.6,
  "spinDecay": 0.15
 },
 "grass": {
  "eMax": 0.74,
  "eMin": 0.42,
  "eDrop": 0.014,
  "bounceMin": 0.6,
  "muBounce": 0.45,
  "muSlide": 0.5,
  "rollSlip": 0.04,
  "rollConst": 0.55,
  "rollLin": 0.32,
  "spinDecay": 3,
  "restSpeed": 0.06
 },
 "post": {
  "r": 0.06,
  "e": 0.6,
  "friction": 0.18,
  "spinKeep": 0.35
 },
 "net": {
  "k": 900,
  "c": 16,
  "maxPen": 0.5,
  "maxBack": 1.2,
  "friction": 4
 },
 "keeper": {
  "catchHands": 21,
  "catchChest": 15,
  "twoHands": 0.24
 },
 "body": {
  "e": 0.3,
  "friction": 0.4
 },
 "hands": {
  "e": 0.35,
  "friction": 0.3
 },
 "player": {
  "jog": 3.9,
  "sprint": 6.6,
  "withBall": 0.93,
  "charging": 0.55,
  "accel": 3.2,
  "decel": 5.5,
  "turn": 9,
  "turnAtSprint": 0.55,
  "bounds": {
   "x": 30,
   "zMin": 1.2,
   "zMax": 42
  }
 },
 "control": {
  "reach": 0.38,
  "reachPerSpeed": 0.035,
  "side": 0.09,
  "gain": 9,
  "maxCorr": 5.5,
  "resp": 22,
  "touchPush": 0.1,
  "touchPushPerSpeed": 0.04,
  "pushDecay": 5,
  "touchMin": 0.3,
  "touchMax": 0.6,
  "bodyR": 0.27,
  "loseDist": 1.3,
  "captureR": 0.6,
  "captureH": 0.32,
  "captureVrel": 9,
  "trapBase": 0.1,
  "trapPerV": 0.035,
  "regrab": 0.45,
  "clearDist": 1.1,
  "stopTrap": 1.8
 },
 "shot": {
  "vMin": 13,
  "vMax": 31,
  "runBonus": 0.3,
  "runBonusMax": 1.8,
  "height": 0.9,
  "finesseHeight": 1.35,
  "overPower": 0.92,
  "overLift": 22,
  "topspin": 7,
  "finesseSpeed": 0.85,
  "finesseSpin": 36,
  "contactR": 0.55,
  "stickAngle": 1.0471975511965976
 }
};
