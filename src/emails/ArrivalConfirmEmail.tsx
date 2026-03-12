import {
  Body, Container, Head, Heading, Html, Preview, Text, Tailwind,
} from "@react-email/components";

interface Props {
  guardianName: string;
  studentName: string;
  className: string;
  sessionDate: string;
}

export function ArrivalConfirmEmail({ guardianName, studentName, className, sessionDate }: Props) {
  return (
    <Html>
      <Head />
      <Preview>{studentName} has arrived safely at {className}</Preview>
      <Tailwind>
        <Body className="bg-[#FDF8F3] font-sans py-10">
          <Container className="bg-white rounded-2xl max-w-lg mx-auto px-10 py-10 shadow-sm border border-[#EAD9C6]">
            <div className="w-12 h-12 rounded-full bg-[#DFF2EB] flex items-center justify-center text-2xl mb-4">✅</div>
            <Heading className="font-bold text-[#2C1810] text-xl mb-2" style={{ fontFamily: "Georgia, serif" }}>
              {studentName} has arrived!
            </Heading>
            <Text className="text-[#5C3D2E] text-sm mb-4 leading-relaxed">
              Hi {guardianName},<br /><br />
              This is a confirmation that <strong>{studentName}</strong> was checked in to <strong>{className}</strong> on {sessionDate}.
            </Text>
            <Text className="text-xs text-[#8B6355] mt-6">
              You’re receiving this because you are listed as a guardian in Herder. To update notification preferences, contact your program administrator.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

export default ArrivalConfirmEmail;
