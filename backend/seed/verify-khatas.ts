import mongoose from 'mongoose';
import { env } from '../config/env';
import '../models';
import { Khata } from '../models/khata.model';
import { Boss } from '../models/boss.model';
import { Staff } from '../models/staff.model';

async function main() {
  await mongoose.connect(env.mongodbUri);
  try {
    const khatas = await Khata.find({}).lean();
    for (const k of khatas.filter((k) => k.type === 'OFFICE')) {
      const bosses = await Boss.find({ khataId: k._id, isDefault: false }).lean();
      const staff = await Staff.find({ khataId: k._id }).lean();
      const officeOpening = k.openingBalancePaisa / 100;
      const bossText = bosses.map((b) => `${b.name}:${b.openingBalancePaisa / 100}`).join(', ') || '-';
      const staffText = staff.map((s) => `${s.name}[${s.bossId ? 'under boss' : 'pool'}/${s.billingResponsibility}/${s.openingBalancePaisa / 100}]`).join(', ') || '-';
      console.log(`${k.displayName} (${k.billingMode}) office=${officeOpening} | bosses: ${bossText} | staff: ${staffText}`);
    }
    const individuals = khatas.filter((k) => k.type === 'INDIVIDUAL');
    const totalIndividual = individuals.reduce((s, k) => s + k.openingBalancePaisa, 0) / 100;
    console.log(`\nIndividuals: ${individuals.length}, total opening Rs ${totalIndividual}`);
    const officeTotal = khatas.filter((k) => k.type === 'OFFICE').reduce((s, k) => s + k.openingBalancePaisa, 0) / 100;
    const bossTotal = (await Boss.find({ isDefault: false }).lean()).reduce((s, b) => s + b.openingBalancePaisa, 0) / 100;
    const staffTotal = (await Staff.find({ billingResponsibility: 'SELF' }).lean()).reduce((s, x) => s + x.openingBalancePaisa, 0) / 100;
    console.log(`Office-ledger openings Rs ${officeTotal} + boss openings Rs ${bossTotal} + SELF-staff openings Rs ${staffTotal} = Rs ${officeTotal + bossTotal + staffTotal}`);
  } finally {
    await mongoose.disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
