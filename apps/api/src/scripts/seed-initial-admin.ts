import 'reflect-metadata';
import * as bcrypt from 'bcrypt';

import { getAppDataSource } from '../config/database.config';
import { User } from '../modules/auth/entities/user.entity';
import { Staff } from '../modules/staff/entities/staff.entity';
import { StaffRole, AllPermissions } from '../modules/roles/entities/role.entity';
import { Branch } from '../modules/branches/entities/branch.entity';

// Helper to calculate contrasting text color
function getContrastColor(hexColor: string): string {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.5 ? '#000000' : '#ffffff';
}

async function seedInitialAdmin() {
  console.log('🌱 Starting initial admin seed...\n');

  // Get the shared DataSource
  const dataSource = getAppDataSource();
  await dataSource.initialize();
  console.log('✅ Database connected\n');

  // Use a transaction for all operations
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const userRepo = queryRunner.manager.getRepository(User);
    const staffRepo = queryRunner.manager.getRepository(Staff);
    const roleRepo = queryRunner.manager.getRepository(StaffRole);
    const branchRepo = queryRunner.manager.getRepository(Branch);

    // 1. Create Admin Role
    console.log('📋 Checking Admin role...');
    let adminRole = await roleRepo.findOne({ where: { slug: 'admin' } });

    if (!adminRole) {
      adminRole = roleRepo.create({
        name: 'Admin',
        slug: 'admin',
        description: 'Super administrator with all permissions',
        permissions: AllPermissions,
        isSystem: true,
      });
      await roleRepo.save(adminRole);
      console.log('   ✅ Admin role created with all permissions');
    } else {
      // Update permissions to ensure all are present
      adminRole.permissions = AllPermissions;
      adminRole.isSystem = true;
      await roleRepo.save(adminRole);
      console.log('   ✅ Admin role exists, permissions updated');
    }

    // 2. Create Branches
    console.log('\n🏢 Checking branches...');

    // Main Branch
    let mainBranch = await branchRepo.findOne({ where: { slug: 'main' } });
    if (!mainBranch) {
      mainBranch = branchRepo.create({
        name: 'Main',
        slug: 'main',
        isMain: true,
        isActive: true,
        accentColor: '#263238',
        txtOnAccentColor: getContrastColor('#263238'),
      });
      await branchRepo.save(mainBranch);
      console.log('   ✅ Main branch created');
    } else {
      console.log('   ✅ Main branch exists');
    }

    // Kiseka Branch
    let kisekaBranch = await branchRepo.findOne({ where: { slug: 'kiseka' } });
    if (!kisekaBranch) {
      kisekaBranch = branchRepo.create({
        name: 'Kiseka',
        slug: 'kiseka',
        isMain: false,
        isActive: true,
        accentColor: '#009688',
        txtOnAccentColor: getContrastColor('#009688'),
      });
      await branchRepo.save(kisekaBranch);
      console.log('   ✅ Kiseka branch created');
    } else {
      console.log('   ✅ Kiseka branch exists');
    }

    // 3. Create Initial Admin User & Staff
    const adminEmail = 'shindradavid.work@gmail.com';
    console.log(`\n👤 Checking admin user (${adminEmail})...`);

    let user = await userRepo.findOne({ where: { email: adminEmail } });

    if (!user) {
      // Generate password hash
      const defaultPassword = 'Admin@123098';
      const salt = await bcrypt.genSalt();
      const hashedPassword = await bcrypt.hash(defaultPassword, salt);

      // Create user
      user = userRepo.create({
        email: adminEmail,
        hashedPassword,
        accountType: 'admin',
        emailVerified: true,
        isActive: true,
      });
      await userRepo.save(user);
      console.log('   ✅ Admin user created');
      console.log(`   📧 Email: ${adminEmail}`);
      console.log(`   🔐 Default Password: ${defaultPassword}`);
    } else {
      console.log('   ✅ Admin user exists');
    }

    // Check if staff profile exists
    let staff = await staffRepo.findOne({
      where: { userAccountId: user.id },
      relations: ['roles', 'assignedBranches'],
    });

    if (!staff) {
      // Generate dicebear avatar
      const dicebearUrl = `https://api.dicebear.com/7.x/initials/png?seed=SD&backgroundColor=1a365d`;

      staff = staffRepo.create({
        userAccountId: user.id,
        firstName: 'System',
        lastName: 'Admin',
        primaryPhoneNumber: '0782346200',
        photoUrl: dicebearUrl,
        roles: [adminRole],
        assignedBranches: [mainBranch, kisekaBranch],
      });
      await staffRepo.save(staff);
      console.log('   ✅ Staff profile created');
      console.log('   👤 Name: System Admin');
      console.log('   📞 Phone: 0782346200');
      console.log('   🏢 Branches: Main, Kiseka');
    } else {
      // Update to ensure admin role and branches
      staff.roles = [adminRole];
      staff.assignedBranches = [mainBranch, kisekaBranch];
      await staffRepo.save(staff);
      console.log('   ✅ Staff profile exists, roles/branches updated');
    }

    // Commit the transaction
    await queryRunner.commitTransaction();
    console.log('\n✅ Seed complete!\n');
  } catch (err) {
    // Rollback on error
    await queryRunner.rollbackTransaction();
    console.error('❌ Seed failed, transaction rolled back:', err);
    throw err;
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }

  process.exit(0);
}

seedInitialAdmin().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
